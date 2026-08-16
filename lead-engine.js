// lead-engine.js — Jets West Leaseback Inquiry Funnel, Phase 1 §2/§3
//
// Given a Jotform lead (first name + ZIP + email + primary goal), this module:
//   1. Geocodes the ZIP to lat/long                         (§2A)
//   2. Finds public-use airports within the search radius    (§2B)
//   3. Searches nearby aviation operators via Google Places  (§2C)
//   4. Enriches each with website / phone via Place Details  (§2D)
//   5. Filters out maintenance-only / fuel-only / off-target (§2E)
//   6. Ranks each as Strong Potential Fit / Possible / Secondary (§2F)
//   7. Renders a branded prospect-facing report              (§3)
//
// The search starts at 50 miles and auto-expands to 75 then 100 if fewer than
// MIN_VIABLE operators are found (§2 assignment).
//
// Data source: Google Places + Geocoding API (one key: GOOGLE_PLACES_API_KEY).
// Airport identifiers are best-effort from Places today; the airport lookup is
// isolated in findAirports() so an authoritative FAA/NASR dataset can be dropped
// in later without touching the rest of the pipeline.
//
// CREDIBILITY RULE (§2): never claim an operator "is interested" or "needs an
// aircraft". Everything here is labelled a *Potential* fit, and every report
// discloses that current demand has not been verified by Jets West.

const { matchLeasebackAircraft } = require('./inventory');

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const TEXTSEARCH_URL = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

const MIN_VIABLE = 5;              // expand radius until we clear this bar
const RADIUS_STEPS = [50, 75, 100]; // miles
const MAX_ENRICH = 14;             // cap Place Details calls per lead (quota guard)
const MAX_REPORTED = 10;           // §3: present ~5-10 ranked candidates

// Search phrases mapped to Places text queries (§2C).
const OPERATOR_QUERIES = [
  'flight school',
  'flight training',
  'aircraft rental',
  'flying club',
  'aviation academy',
  'FBO fixed base operator',
  'aircraft management',
];

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

function haversineMiles(a, b) {
  const R = 3958.8; // Earth radius, miles
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Google Places / Geocoding helpers
// ---------------------------------------------------------------------------

async function callGoogle(url, params, apiKey) {
  const qs = new URLSearchParams({ ...params, key: apiKey }).toString();
  const resp = await fetch(`${url}?${qs}`);
  if (!resp.ok) throw new Error(`Google API HTTP ${resp.status}`);
  const data = await resp.json();
  // Google returns 200 with a status field; OK and ZERO_RESULTS are both fine.
  if (data.status && !['OK', 'ZERO_RESULTS'].includes(data.status)) {
    throw new Error(`Google API status ${data.status}: ${data.error_message || ''}`.trim());
  }
  return data;
}

async function geocodeZip(zip, apiKey) {
  const data = await callGoogle(
    GEOCODE_URL,
    { components: `postal_code:${zip}|country:US` },
    apiKey
  );
  const hit = data.results?.[0];
  if (!hit) throw new Error(`Could not geocode ZIP ${zip}`);
  const loc = hit.geometry.location;
  const comp = (type) =>
    hit.address_components?.find((c) => c.types.includes(type))?.short_name || null;
  return {
    zip,
    lat: loc.lat,
    lng: loc.lng,
    city: comp('locality') || comp('postal_town') || comp('sublocality') || null,
    state: comp('administrative_area_level_1'),
  };
}

// Text Search biases by location+radius but is not a hard cutoff, so we always
// re-filter results by true haversine distance against the requested radius.
async function textSearch(query, center, radiusMiles, apiKey) {
  const data = await callGoogle(
    TEXTSEARCH_URL,
    {
      query,
      location: `${center.lat},${center.lng}`,
      radius: Math.round(radiusMiles * 1609.34),
    },
    apiKey
  );
  return data.results || [];
}

async function placeDetails(placeId, apiKey) {
  const data = await callGoogle(
    DETAILS_URL,
    {
      place_id: placeId,
      fields:
        'name,formatted_address,formatted_phone_number,international_phone_number,website,url,rating,user_ratings_total,business_status,types',
    },
    apiKey
  );
  return data.result || {};
}

// ---------------------------------------------------------------------------
// Airports (§2B) — Places-based today, swappable for FAA data later.
// ---------------------------------------------------------------------------

async function findAirports(center, radiusMiles, apiKey) {
  const results = await textSearch('public airport', center, radiusMiles, apiKey);
  return results
    .map((r) => {
      const loc = r.geometry?.location;
      if (!loc) return null;
      return {
        name: r.name,
        identifier: extractIdentifier(r.name), // best-effort; FAA data would be canonical
        lat: loc.lat,
        lng: loc.lng,
        distanceMiles: round1(haversineMiles(center, { lat: loc.lat, lng: loc.lng })),
      };
    })
    .filter((a) => a && a.distanceMiles <= radiusMiles && !/heliport|seaplane/i.test(a.name))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);
}

// Pull a parenthetical or trailing code like "(KAPA)" / "APA" from an airport name.
function extractIdentifier(name) {
  const paren = name.match(/\(([A-Z0-9]{3,4})\)/);
  if (paren) return paren[1];
  const trailing = name.match(/\b([A-Z]{3,4})\b$/);
  return trailing ? trailing[1] : null;
}

function nearestAirport(loc, airports) {
  let best = null;
  for (const ap of airports) {
    const d = haversineMiles(loc, ap);
    if (!best || d < best.d) best = { ap, d };
  }
  return best ? { name: best.ap.name, identifier: best.ap.identifier, distanceMiles: round1(best.d) } : null;
}

// ---------------------------------------------------------------------------
// Operator classification: filter (§2E) + rank (§2F)
// ---------------------------------------------------------------------------

const RE = {
  training: /flight school|flight training|flight academy|aviation academy|flying club|pilot (school|training)|learn to fly|ground school/i,
  rental: /aircraft rental|plane rental|rent(al)? aircraft|club aircraft/i,
  fbo: /\bfbo\b|fixed base operator/i,
  management: /aircraft management|leaseback|lease back|dry lease|charter management|part 135/i,
  // §2E exclusions
  maintenanceOnly: /(avionics|maintenance|repair|mro|paint|interior|upholstery|propeller|engine (shop|overhaul))/i,
  fuelOnly: /fuel|self[- ]serve fuel|avgas only/i,
  helicopterOnly: /helicopter|heli[- ]?(tour|charter|school)|rotor/i,
  offTarget: /museum|restaurant|hotel|car rental|parking|hangar rental only|skydiv|balloon|drone|model (aircraft|airplane)|hobby/i,
};

// Decide keep/drop and why. Returns { keep, reason }.
function classify(op, goal) {
  const hay = `${op.name} ${op.address || ''} ${(op.types || []).join(' ')}`;

  const isTraining = RE.training.test(hay);
  const isRental = RE.rental.test(hay);
  const isFbo = RE.fbo.test(hay);
  const isMgmt = RE.management.test(hay);
  const relevant = isTraining || isRental || isFbo || isMgmt;

  // Obvious non-matches (§2E) — drop unless the prospect's goal makes them relevant.
  if (RE.offTarget.test(hay) && !relevant) return { keep: false, reason: 'Off-target business type' };
  if (RE.helicopterOnly.test(hay) && !/airplane|fixed[- ]wing|cessna|piper|cirrus/i.test(hay)) {
    return { keep: false, reason: 'Helicopter-only operator' };
  }
  if (RE.maintenanceOnly.test(hay) && !relevant) return { keep: false, reason: 'Maintenance/avionics-only shop' };
  if (RE.fuelOnly.test(hay) && !relevant) return { keep: false, reason: 'Fuel-only FBO' };
  if (!relevant) return { keep: false, reason: 'No training / rental / management signal' };

  op.flightTraining = isTraining;
  op.rental = isRental;
  op.leasebackLanguage = isMgmt;
  op._flags = { isTraining, isRental, isFbo, isMgmt };

  // Business type label
  op.businessType = isMgmt
    ? 'Aircraft management / charter'
    : isTraining && isRental
      ? 'Flight school & rental'
      : isTraining
        ? 'Flight school'
        : isRental
          ? 'Aircraft rental / club'
          : 'FBO / fixed base operator';

  return { keep: true, reason: '' };
}

// Score → rating (§2F). Higher score = stronger leaseback potential.
function rank(op, goal) {
  const f = op._flags;
  let score = 0;
  const reasons = [];

  if (f.isMgmt) { score += 4; reasons.push('management / leaseback language on site'); }
  if (f.isRental) { score += 3; reasons.push('active aircraft rental fleet'); }
  if (f.isTraining) { score += 3; reasons.push('flight-training activity (utilization demand)'); }
  if (f.isFbo) { score += 2; reasons.push('based FBO operation'); }
  if (op.website) { score += 1; }
  if ((op.rating || 0) >= 4 && (op.reviews || 0) >= 10) { score += 1; reasons.push('established local reputation'); }
  if (op.distanceMiles != null && op.distanceMiles <= 25) { score += 1; reasons.push('close to prospect'); }

  // Goal-aware nudge: if the prospect's goal mentions training/rental, reward matches.
  if (goal && /train|instruct|rent|club/i.test(goal) && (f.isTraining || f.isRental)) score += 1;

  let rating;
  if (score >= 6) rating = 'Strong Potential Fit';
  else if (score >= 3) rating = 'Possible Fit';
  else rating = 'Secondary Prospect';

  op.score = score;
  op.fitRating = rating;
  op.reason =
    (reasons.length ? capitalize(reasons.slice(0, 3).join('; ')) : 'Aviation operator in the prospect’s market') + '.';
  return op;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

async function collectOperators(center, radiusMiles, apiKey) {
  // Fan out across the operator search phrases, dedupe by place_id.
  const settled = await Promise.all(
    OPERATOR_QUERIES.map((q) => textSearch(q, center, radiusMiles, apiKey).catch(() => []))
  );

  const byId = new Map();
  for (const list of settled) {
    for (const r of list) {
      const loc = r.geometry?.location;
      if (!r.place_id || !loc) continue;
      if (byId.has(r.place_id)) continue;
      const distanceMiles = round1(haversineMiles(center, { lat: loc.lat, lng: loc.lng }));
      if (distanceMiles > radiusMiles) continue; // hard radius cutoff
      if (r.business_status && r.business_status !== 'OPERATIONAL') continue;
      byId.set(r.place_id, {
        placeId: r.place_id,
        name: r.name,
        address: r.formatted_address || null,
        lat: loc.lat,
        lng: loc.lng,
        distanceMiles,
        rating: r.rating || null,
        reviews: r.user_ratings_total || null,
        types: r.types || [],
        mapsUrl: `https://www.google.com/maps/place/?q=place_id:${r.place_id}`,
      });
    }
  }
  return [...byId.values()];
}

async function runLeadSearch(lead, apiKey) {
  if (!apiKey) throw new Error('GOOGLE_PLACES_API_KEY is not configured');

  const center = await geocodeZip(lead.zip, apiKey);

  // §2: start at 50mi, expand to 75 then 100 until we clear MIN_VIABLE.
  let radiusMiles = RADIUS_STEPS[0];
  let candidates = [];
  for (const step of RADIUS_STEPS) {
    radiusMiles = step;
    candidates = await collectOperators(center, step, apiKey);
    const provisional = candidates.filter((op) => classify(op, lead.goal).keep);
    if (provisional.length >= MIN_VIABLE) break;
  }

  const airports = await findAirports(center, radiusMiles, apiKey);

  // §2E filter
  let operators = candidates.filter((op) => classify(op, lead.goal).keep);

  // §2D enrich (bounded) — closest first so we spend quota on the best prospects.
  operators.sort((a, b) => a.distanceMiles - b.distanceMiles);
  await Promise.all(
    operators.slice(0, MAX_ENRICH).map(async (op) => {
      try {
        const d = await placeDetails(op.placeId, apiKey);
        op.website = d.website || null;
        op.phone = d.formatted_phone_number || d.international_phone_number || null;
        op.contactPage = d.website || d.url || op.mapsUrl;
        if (d.rating) op.rating = d.rating;
        if (d.user_ratings_total) op.reviews = d.user_ratings_total;
      } catch {
        /* leave un-enriched; still usable from search fields */
      }
    })
  );

  // §2F rank + attach nearest airport + verification date
  const verifiedAt = new Date().toISOString();
  operators = operators.map((op) => {
    rank(op, lead.goal);
    op.airport = nearestAirport({ lat: op.lat, lng: op.lng }, airports);
    op.dateLastVerified = verifiedAt;
    return op;
  });

  // Sort by fit then distance, cap at MAX_REPORTED (§3).
  const rankOrder = { 'Strong Potential Fit': 0, 'Possible Fit': 1, 'Secondary Prospect': 2 };
  operators.sort(
    (a, b) => rankOrder[a.fitRating] - rankOrder[b.fitRating] || b.score - a.score || a.distanceMiles - b.distanceMiles
  );
  const reported = operators.slice(0, MAX_REPORTED);

  return {
    prospect: {
      firstName: lead.firstName || null,
      email: lead.email || null,
      zip: lead.zip,
      goal: lead.goal || null,
      source: lead.source || null,
      city: center.city,
      state: center.state,
    },
    center: { lat: center.lat, lng: center.lng },
    searchRadiusMiles: radiusMiles,
    radiusExpanded: radiusMiles > RADIUS_STEPS[0],
    airportsFound: airports.length,
    operatorsFound: operators.length,
    inventoryMatches: matchLeasebackAircraft(lead.goal), // JetsWest aircraft to consider first
    operators: reported,
    generatedAt: verifiedAt,
    demandVerified: false, // credibility rule (§2)
  };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function round1(n) { return Math.round(n * 10) / 10; }
// "Centennial Airport" + "KAPA" -> "Centennial Airport (KAPA)", but avoid
// doubling when the identifier is already present in the name.
function formatAirport(airport) {
  if (!airport) return '—';
  const { name, identifier } = airport;
  if (identifier && !name.includes(identifier)) return `${name} (${identifier})`;
  return name;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

module.exports = { runLeadSearch, renderReportHTML, renderReportText, haversineMiles };

// ---------------------------------------------------------------------------
// §3 Prospect-facing report
// ---------------------------------------------------------------------------

// TODO: repoint to a dedicated /leaseback page once it exists on the site.
const LEASEBACK_OVERVIEW_URL = 'https://www.gojetswest.com';
const BOOKING_URL = process.env.BOOKING_URL || 'https://gojetswest.com/booking-calendar';
const CALCULATOR_URL = process.env.CALCULATOR_URL || 'https://jetswest-relay-production.up.railway.app/calculator';

const FIT_COLORS = {
  'Strong Potential Fit': '#31c48d',
  'Possible Fit': '#d4af37',
  'Secondary Prospect': '#7f9cc0',
};

function renderReportHTML(result) {
  const p = result.prospect;
  const hello = p.firstName ? `Hi ${esc(p.firstName)},` : 'Hello,';
  const where = p.city ? `${esc(p.city)}, ${esc(p.state)}` : `ZIP ${esc(p.zip)}`;

  const cards = result.operators.map((op, i) => {
    const color = FIT_COLORS[op.fitRating] || '#7f9cc0';
    const airport = esc(formatAirport(op.airport));
    const yn = (v) => (v ? 'Yes' : '—');
    const contact = [
      op.phone ? `<a href="tel:${esc(op.phone)}" style="color:#9ec5ff;text-decoration:none">${esc(op.phone)}</a>` : null,
      op.website ? `<a href="${esc(op.website)}" style="color:#9ec5ff;text-decoration:none">Website</a>` : null,
      `<a href="${esc(op.mapsUrl)}" style="color:#9ec5ff;text-decoration:none">Map</a>`,
    ].filter(Boolean).join(' &nbsp;·&nbsp; ');

    return `
    <tr><td style="padding:0 0 14px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1a2b;border:1px solid #1c2f47;border-radius:12px">
        <tr><td style="padding:16px 18px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td style="font:600 16px/1.3 Arial,sans-serif;color:#eaf2ff">${i + 1}. ${esc(op.name)}</td>
              <td align="right" style="white-space:nowrap">
                <span style="font:600 11px/1 Arial,sans-serif;color:#08131f;background:${color};padding:5px 9px;border-radius:20px">${esc(op.fitRating)}</span>
              </td>
            </tr>
          </table>
          <div style="font:400 13px/1.5 Arial,sans-serif;color:#9fb3cc;margin-top:6px">
            ${esc(op.businessType)} &nbsp;·&nbsp; ${op.distanceMiles} mi from you &nbsp;·&nbsp; nearest field: ${airport}
          </div>
          <div style="font:400 13px/1.6 Arial,sans-serif;color:#c6d5ea;margin-top:8px">
            Flight training: <strong style="color:#eaf2ff">${yn(op.flightTraining)}</strong> &nbsp;·&nbsp;
            Aircraft rental: <strong style="color:#eaf2ff">${yn(op.rental)}</strong>
          </div>
          <div style="font:400 13px/1.6 Arial,sans-serif;color:#8fa6c2;margin-top:8px">${esc(op.reason)}</div>
          <div style="font:400 13px/1.6 Arial,sans-serif;margin-top:10px">${contact}</div>
        </td></tr>
      </table>
    </td></tr>`;
  }).join('');

  // Matching JetsWest inventory to consider first (spec: suggest our aircraft).
  const inv = result.inventoryMatches || [];
  const invCards = inv.map((a) => `
    <tr><td style="padding:0 0 12px 0">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0d1a2b;border:1px solid #1c2f47;border-radius:12px">
        <tr><td style="padding:14px 18px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font:600 16px/1.3 Arial,sans-serif;color:#eaf2ff">${esc(a.name)} <span style="color:#8fa6c2;font-weight:400">(${esc(a.year)})</span></td>
            <td align="right" style="font:700 15px/1 Arial,sans-serif;color:#d4af37;white-space:nowrap">${esc(a.price)}</td>
          </tr></table>
          <div style="font:400 13px/1.5 Arial,sans-serif;color:#9fb3cc;margin-top:6px">${esc(a.category)} &nbsp;·&nbsp; ${a.specs.map(esc).join(' · ')}</div>
          <div style="font:400 13px/1.6 Arial,sans-serif;color:#8fa6c2;margin-top:8px">${esc(a.reason)}</div>
          <div style="font:400 13px/1.6 Arial,sans-serif;margin-top:10px"><a href="${esc(a.url)}" style="color:#9ec5ff;text-decoration:none">View at gojetswest.com →</a></div>
        </td></tr>
      </table>
    </td></tr>`).join('');
  const invSection = inv.length ? `
      <tr><td style="padding:6px 4px 10px;font:700 12px/1 Arial,sans-serif;letter-spacing:2px;color:#d4af37;text-transform:uppercase">Aircraft to consider from JetsWest</td></tr>
      <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${invCards}</table></td></tr>
      <tr><td style="padding:12px 4px 10px;font:700 12px/1 Arial,sans-serif;letter-spacing:2px;color:#d4af37;text-transform:uppercase">Local operators who could fly it</td></tr>` : '';

  const expandNote = result.radiusExpanded
    ? ` We widened the search to ${result.searchRadiusMiles} miles to bring you a strong set of options.`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Local Leaseback Opportunity Report — Jets West</title></head>
<body style="margin:0;background:#060e1a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#060e1a">
  <tr><td align="center" style="padding:28px 16px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="padding:0 4px 18px">
        <div style="font:700 13px/1 Arial,sans-serif;letter-spacing:3px;color:#d4af37">JETS WEST AVIATION</div>
        <div style="font:700 24px/1.25 Arial,sans-serif;color:#eaf2ff;margin-top:10px">Your Local Leaseback Opportunity Report</div>
        <div style="font:400 14px/1.6 Arial,sans-serif;color:#9fb3cc;margin-top:8px">${where}</div>
      </td></tr>
      <tr><td style="padding:0 4px 20px;font:400 15px/1.65 Arial,sans-serif;color:#c6d5ea">
        ${hello} thanks for reaching out to Jets West. Here’s what we found for you:
        ${inv.length ? 'aircraft from our own inventory that suit a leaseback, plus ' : ''}${result.operators.length}
        local ${result.operators.length === 1 ? 'operator' : 'operators'} within ${result.searchRadiusMiles} miles
        who could put one to work.${expandNote} No action needed on your part — if anything stands out,
        <strong style="color:#eaf2ff">we’ll make the introductions for you</strong>.
      </td></tr>
      ${invSection}
      <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cards}</table></td></tr>
      <tr><td style="padding:8px 4px 4px">
        <a href="${CALCULATOR_URL}" style="display:inline-block;font:600 14px/1 Arial,sans-serif;color:#08131f;background:#d4af37;padding:13px 22px;border-radius:8px;text-decoration:none">See what this looks like for your budget →</a>
      </td></tr>
      <tr><td style="padding:10px 4px 4px">
        <a href="${LEASEBACK_OVERVIEW_URL}" style="display:inline-block;font:600 14px/1 Arial,sans-serif;color:#eaf2ff;border:1px solid #2b4260;padding:12px 22px;border-radius:8px;text-decoration:none">How Jets West leasebacks work</a>
        &nbsp;&nbsp;
        <a href="${BOOKING_URL}" style="display:inline-block;font:600 14px/1 Arial,sans-serif;color:#eaf2ff;border:1px solid #2b4260;padding:12px 22px;border-radius:8px;text-decoration:none">Book a call</a>
      </td></tr>
      <tr><td style="padding:20px 4px 0;font:400 12px/1.6 Arial,sans-serif;color:#6b82a0;border-top:1px solid #14243a;margin-top:16px">
        These operators are <strong style="color:#8fa6c2">potential</strong> leaseback fits identified from public
        information. Jets West has <strong style="color:#8fa6c2">not yet verified</strong> that any of them currently
        needs an aircraft — we’ll confirm real demand and economics before any introduction.
        Report generated ${new Date(result.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function renderReportText(result) {
  const p = result.prospect;
  const lines = [];
  lines.push('JETS WEST AVIATION — Your Local Leaseback Opportunity Report');
  lines.push(`${p.city ? `${p.city}, ${p.state}` : `ZIP ${p.zip}`} · within ${result.searchRadiusMiles} miles`);
  lines.push('');
  const inv = result.inventoryMatches || [];
  if (inv.length) {
    lines.push('AIRCRAFT TO CONSIDER FROM JETSWEST:');
    inv.forEach((a) => {
      lines.push(`  • ${a.name} (${a.year}) — ${a.price} · ${a.category}`);
      lines.push(`    ${a.reason}  gojetswest.com`);
    });
    lines.push('');
  }
  lines.push(`${p.firstName ? `Hi ${p.firstName},` : 'Hello,'} we also searched your local market and found ${result.operators.length} potential leaseback operator(s):`);
  lines.push('');
  result.operators.forEach((op, i) => {
    lines.push(`${i + 1}. ${op.name}  [${op.fitRating}]`);
    lines.push(`   ${op.businessType} · ${op.distanceMiles} mi · nearest field: ${formatAirport(op.airport)}`);
    lines.push(`   Training: ${op.flightTraining ? 'Yes' : '—'} · Rental: ${op.rental ? 'Yes' : '—'}`);
    if (op.phone) lines.push(`   Phone: ${op.phone}`);
    if (op.website) lines.push(`   Web: ${op.website}`);
    lines.push(`   Why: ${op.reason}`);
    lines.push('');
  });
  lines.push('These are POTENTIAL fits from public info. Jets West has not verified current demand;');
  lines.push('we confirm real utilization and economics before any introduction.');
  return lines.join('\n');
}
