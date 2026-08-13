// airtable.js — persists each lead run to Airtable (spec §6).
//
// Two writes per lead:
//   1. Upsert every reported operator into the master "Operators" table,
//      keyed by Google Place ID (refresh Date Last Verified, bump Times
//      Surfaced) — this is what turns the table into a reusable master DB
//      instead of researching every lead from scratch.
//   2. Create a row in "Leads" with the follow-up state (Status, Next Action
//      Date) that the §4 follow-up sequence scans.
//
// Config (all optional — isConfigured() is false without them, and /lead just
// skips persistence):
//   AIRTABLE_TOKEN            personal access token
//   AIRTABLE_BASE_ID          base id (appXX␣...)
//   AIRTABLE_OPERATORS_TABLE  defaults to "Operators"
//   AIRTABLE_LEADS_TABLE      defaults to "Leads"
//
// We send `typecast: true` so Airtable coerces values and auto-creates select
// options (Business Type, Fit Rating), which keeps writes robust even before
// every column has been converted to its final field type.

const API = 'https://api.airtable.com/v0';

const cfg = {
  token: () => process.env.AIRTABLE_TOKEN,
  base: () => process.env.AIRTABLE_BASE_ID,
  operators: () => process.env.AIRTABLE_OPERATORS_TABLE || 'Operators',
  leads: () => process.env.AIRTABLE_LEADS_TABLE || 'Leads',
};

function isConfigured() {
  return Boolean(cfg.token() && cfg.base());
}

async function at(method, table, { path = '', body } = {}) {
  const url = `${API}/${cfg.base()}/${encodeURIComponent(table)}${path}`;
  const resp = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${cfg.token()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!resp.ok) throw new Error(`Airtable ${resp.status}: ${(await resp.text().catch(() => '')).slice(0, 200)}`);
  return resp.json();
}

function today() { return new Date().toISOString().slice(0, 10); }
function plusDaysISO(n) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function operatorFields(op) {
  return {
    'Operator Name': op.name,
    'Google Place ID': op.placeId,
    'Business Type': op.businessType || '',
    'Airport': op.airport?.name || '',
    'Airport ID': op.airport?.identifier || '',
    'City': op.address || '',
    'Lat': op.lat,
    'Lng': op.lng,
    'Main Phone': op.phone || '',
    'Website': op.website || '',
    'Contact Page': op.contactPage || op.website || op.mapsUrl || '',
    'Flight Training': !!op.flightTraining,
    'Aircraft Rental': !!op.rental,
    'Leaseback Language': !!op.leasebackLanguage,
    'Fit Rating': op.fitRating || '',
    'Reason for Rating': op.reason || '',
    'Source Links': op.mapsUrl || '',
    'Date Last Verified': op.dateLastVerified ? op.dateLastVerified.slice(0, 10) : today(),
  };
}

// Upsert one operator by Google Place ID.
async function upsertOperator(op) {
  if (!op.placeId) return;
  const formula = `{Google Place ID}='${String(op.placeId).replace(/'/g, "\\'")}'`;
  const found = await at('GET', cfg.operators(), {
    path: `?filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`,
  });
  const existing = found.records?.[0];
  const surfaced = (existing?.fields?.['Times Surfaced'] || 0) + 1;
  const fields = { ...operatorFields(op), 'Times Surfaced': surfaced };

  if (existing) {
    await at('PATCH', cfg.operators(), { body: { records: [{ id: existing.id, fields }], typecast: true } });
  } else {
    await at('POST', cfg.operators(), { body: { records: [{ fields }], typecast: true } });
  }
}

async function createLead(result, { emailed } = {}) {
  const p = result.prospect;
  const fields = {
    'First Name': p.firstName || '',
    'Email': p.email || '',
    'ZIP': p.zip || '',
    'City': p.city || '',
    'State': p.state || '',
    'Primary Goal': p.goal || '',
    'Source': p.source || '',
    'Submission Date': new Date().toISOString(),
    'Search Radius Used': result.searchRadiusMiles,
    'Status': emailed ? 'Report Sent' : 'New',
    'Report Sent At': emailed ? new Date().toISOString() : '',
    'Next Action': 'Day 1 email',
    'Next Action Date': plusDaysISO(1),
    'Matched Operators': result.operators.map((o) => o.placeId).filter(Boolean).join(', '),
  };
  const created = await at('POST', cfg.leads(), { body: { records: [{ fields }], typecast: true } });
  return created.records?.[0]?.id || null;
}

// Persist a whole lead run. Best-effort per record so one bad write never sinks
// the rest; returns a summary the endpoint includes in its response.
async function saveLeadRun(result, opts = {}) {
  const summary = { operatorsUpserted: 0, operatorErrors: 0, leadId: null };
  for (const op of result.operators) {
    try {
      await upsertOperator(op);
      summary.operatorsUpserted++;
    } catch (e) {
      summary.operatorErrors++;
      console.error('[airtable] operator upsert failed:', e.message);
    }
  }
  try {
    summary.leadId = await createLead(result, opts);
  } catch (e) {
    summary.leadError = e.message;
    console.error('[airtable] lead create failed:', e.message);
  }
  return summary;
}

module.exports = { isConfigured, saveLeadRun, upsertOperator, createLead };
