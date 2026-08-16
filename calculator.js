// calculator.js — JetsWest leaseback estimate engine.
//
// Turns an aircraft price + a few assumptions into a plain-English picture of
// what owning-and-leasing-back would look like month to month: loan payment,
// estimated leaseback income, and the net (cash flow vs. out of pocket).
//
// IMPORTANT: every number this produces is an ILLUSTRATIVE ESTIMATE, not a quote
// or a guarantee. Real leaseback demand, rates, and economics are confirmed with
// the operator before any commitment. This is not tax, legal, or financing advice.
//
// The DEFAULTS below are conservative, industry-typical placeholders — Stan should
// confirm/adjust them to match how JetsWest actually structures deals. They can
// also be overridden per-request (the page and API pass them in).

const DEFAULTS = {
  downPct: 0.20, // share of price paid up front (20%)
  aprPct: 0.085, // financing APR on the balance (8.5%)
  termYears: 15, // loan term
  hoursPerMonth: 40, // estimated leaseback utilization
  ownerRatePerHour: 135, // net $/hour to the owner AFTER the operator's cut
  fixedMonthly: 900, // owner-side fixed costs: insurance + hangar + subscriptions
};

// Bounds so bad/hostile input can't produce nonsense.
const LIMITS = {
  price: [0, 100_000_000],
  downPct: [0, 1],
  aprPct: [0, 0.5],
  termYears: [1, 30],
  hoursPerMonth: [0, 300],
  ownerRatePerHour: [0, 5000],
  fixedMonthly: [0, 100_000],
};

function clampNum(v, [lo, hi], fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

// Standard amortized monthly payment.
function monthlyLoanPayment(principal, aprPct, termYears) {
  const r = aprPct / 12;
  const n = Math.round(termYears * 12);
  if (n <= 0) return 0;
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

function round(n, step = 1) {
  return Math.round(n / step) * step;
}

// input: { price, downPct?, aprPct?, termYears?, hoursPerMonth?, ownerRatePerHour?, fixedMonthly? }
function computeLeaseback(input = {}) {
  const price = clampNum(input.price, LIMITS.price, 0);
  const downPct = clampNum(input.downPct, LIMITS.downPct, DEFAULTS.downPct);
  const aprPct = clampNum(input.aprPct, LIMITS.aprPct, DEFAULTS.aprPct);
  const termYears = clampNum(input.termYears, LIMITS.termYears, DEFAULTS.termYears);
  const hoursPerMonth = clampNum(input.hoursPerMonth, LIMITS.hoursPerMonth, DEFAULTS.hoursPerMonth);
  const ownerRatePerHour = clampNum(input.ownerRatePerHour, LIMITS.ownerRatePerHour, DEFAULTS.ownerRatePerHour);
  const fixedMonthly = clampNum(input.fixedMonthly, LIMITS.fixedMonthly, DEFAULTS.fixedMonthly);

  const downPayment = price * downPct;
  const financed = price - downPayment;
  const monthlyPayment = monthlyLoanPayment(financed, aprPct, termYears);

  const estRevenue = hoursPerMonth * ownerRatePerHour; // gross leaseback income to owner
  const monthlyCosts = monthlyPayment + fixedMonthly; // payment + fixed carrying costs
  const netMonthly = estRevenue - monthlyCosts; // + = cash-flow positive, - = out of pocket

  const breakevenHours = ownerRatePerHour > 0 ? monthlyCosts / ownerRatePerHour : null;
  const offsetPercent = monthlyCosts > 0 ? (estRevenue / monthlyCosts) * 100 : 0;

  return {
    inputs: { price, downPct, aprPct, termYears, hoursPerMonth, ownerRatePerHour, fixedMonthly },
    downPayment: round(downPayment),
    financed: round(financed),
    monthlyPayment: round(monthlyPayment),
    estRevenue: round(estRevenue),
    fixedMonthly: round(fixedMonthly),
    monthlyCosts: round(monthlyCosts),
    netMonthly: round(netMonthly),
    cashFlowPositive: netMonthly >= 0,
    breakevenHours: breakevenHours == null ? null : Math.ceil(breakevenHours),
    offsetPercent: Math.round(offsetPercent),
    // A one-line, honest summary the UI / Sophie can echo.
    summary:
      price <= 0
        ? 'Enter an aircraft price to see an estimate.'
        : netMonthly >= 0
          ? `At ~${hoursPerMonth} leaseback hrs/mo, this could cash-flow about $${round(netMonthly).toLocaleString()}/mo after the payment and carrying costs — an estimate, not a guarantee.`
          : `At ~${hoursPerMonth} leaseback hrs/mo, the leaseback covers about ${Math.round(offsetPercent)}% of the monthly cost, leaving roughly $${round(-netMonthly).toLocaleString()}/mo out of pocket — an estimate, not a guarantee.`,
  };
}

// Parse the human price strings in inventory.js ("$199,600", "$695K", "$29M",
// "$685K / $4,950/mo") into a number. Returns 0 if none found.
function parsePrice(str) {
  if (typeof str !== 'string') return 0;
  const m = str.match(/\$\s*([\d,]+(?:\.\d+)?)\s*([KkMm])?/);
  if (!m) return 0;
  let n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  const suffix = (m[2] || '').toLowerCase();
  if (suffix === 'k') n *= 1_000;
  else if (suffix === 'm') n *= 1_000_000;
  return Math.round(n);
}

module.exports = { computeLeaseback, monthlyLoanPayment, parsePrice, DEFAULTS };
