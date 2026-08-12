// Offline smoke test for the leaseback lead engine.
// Runs in CI with no API key and no network — it exercises the pure logic
// (distance math + report rendering) and asserts the key invariants.
// Exits non-zero on any failure so GitHub Actions goes red.

const assert = require('node:assert');
const { renderReportHTML, renderReportText, haversineMiles } = require('../lead-engine');

let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

// 1. Distance math: LAX → SAN is ~105-110 miles.
const d = haversineMiles({ lat: 33.94, lng: -118.40 }, { lat: 32.73, lng: -117.19 });
ok(d > 95 && d < 120, `haversine LAX→SAN out of range: ${d}`);

// Mock search result covering all three fit ratings + both airport-name shapes.
const now = new Date().toISOString();
const result = {
  prospect: { firstName: 'Jane', email: 'jane@example.com', zip: '80112', goal: 'leaseback + training', source: 'fb', city: 'Centennial', state: 'CO' },
  center: { lat: 39.6, lng: -104.9 },
  searchRadiusMiles: 75,
  radiusExpanded: true,
  airportsFound: 3,
  operatorsFound: 2,
  generatedAt: now,
  demandVerified: false,
  operators: [
    { name: 'Skyline Flight Academy', businessType: 'Flight school & rental', distanceMiles: 8.4, flightTraining: true, rental: true, fitRating: 'Strong Potential Fit', score: 8, reason: 'Active rental fleet.', phone: '(303) 555-0142', website: 'https://example.com', mapsUrl: 'https://maps.google.com/?q=1', airport: { name: 'Centennial Airport (KAPA)', identifier: 'KAPA' }, dateLastVerified: now },
    { name: 'Front Range Aircraft Mgmt', businessType: 'Aircraft management / charter', distanceMiles: 22.1, flightTraining: false, rental: false, fitRating: 'Possible Fit', score: 4, reason: 'Management / leaseback language.', phone: null, website: 'https://example.org', mapsUrl: 'https://maps.google.com/?q=2', airport: { name: 'Rocky Mountain Metro', identifier: 'KBJC' }, dateLastVerified: now },
  ],
};

// 2. HTML report renders and carries the credibility disclosure (§2 rule).
const html = renderReportHTML(result);
ok(typeof html === 'string' && html.startsWith('<!DOCTYPE'), 'HTML report should be a full document');
ok(/not yet verified/i.test(html), 'HTML report must include the demand-not-verified disclosure');
ok(!/2b4straints/.test(html), 'HTML report must not contain the old style typo');
ok(html.includes('Skyline Flight Academy') && html.includes('Strong Potential Fit'), 'HTML report must list ranked operators');

// 3. Airport identifier must not double up when already in the name.
const text = renderReportText(result);
ok(!/\(KAPA\)\s*\(KAPA\)/.test(text), 'airport identifier should not double when present in name');
ok(/Rocky Mountain Metro \(KBJC\)/.test(text), 'airport identifier should append when missing from name');
ok(/not verified/i.test(text), 'text report must include the disclosure');

console.log(`ci-smoke: ${checks} assertions passed`);
