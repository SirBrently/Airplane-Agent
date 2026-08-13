// inventory.js — JetsWest aircraft inventory + matchers (single source of truth).
//
// Used by the chat relay (findMatchingAircraft, keyword-based) and by the
// leaseback funnel (matchLeasebackAircraft, goal-aware), which leads every
// operator report with aircraft a prospect could buy from JetsWest and put on
// leaseback. Inventory links point at gojetswest.com.

const INVENTORY_URL = 'https://www.gojetswest.com';

const INVENTORY = [
  { name: 'Challenger 3500', year: '2025', price: '$29M', category: 'Large Cabin Jet', keywords: ['challenger 3500', 'challenger'], specs: ['170.1 hrs TT', '136 Landings', 'Ultra-Long-Range', 'New Delivery'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Bombardier_BD-100-1A10_Challenger_300_AN1704544.jpg/330px-Bombardier_BD-100-1A10_Challenger_300_AN1704544.jpg' },
  { name: 'Falcon 900LX', year: '2012', price: '$19M', category: 'Large Cabin Trijet', keywords: ['falcon 900', 'falcon 900lx', 'falcon'], specs: ['14 Passengers', 'MSP Gold Engines', 'Large Cabin', 'Trijet'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/58/Spanish_Air_Force_Dassault_Falcon_900B.jpg/330px-Spanish_Air_Force_Dassault_Falcon_900B.jpg' },
  { name: 'Learjet 60XR', year: '2008', price: '$1.9M', category: 'Midsize Jet', keywords: ['learjet 60', 'learjet 60xr', 'learjet'], specs: ['3,460 TT', '6 Passengers', 'Mach 0.81', 'Midsize Jet'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fb/Bombardier.learjet60.oe-gtf.arp.jpg/330px-Bombardier.learjet60.oe-gtf.arp.jpg' },
  { name: 'Beechjet 400', year: '1988', price: '$875K', category: 'Light Jet', keywords: ['beechjet 400', 'beechjet'], specs: ['4,890 TT', 'Garmin Avionics', '7 Passengers', 'Light Jet'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3f/T-1A_Jayhawk.jpg/330px-T-1A_Jayhawk.jpg' },
  { name: 'Citation II', year: '1982', price: '$695K', category: 'Light Jet', keywords: ['citation ii', 'citation 2'], specs: ['10 Seats', 'Low-Time Engines', '10% Down Financing', 'Light Jet'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Cessna_550b_citation_bravo_cs-dhr_arp.jpg/330px-Cessna_550b_citation_bravo_cs-dhr_arp.jpg' },
  { name: 'Citation 501SP',year: '1977', price: '$685K / $4,950/mo', category: 'Entry Jet', keywords: ['citation 501', '501sp'], specs: ['6,847 TT', 'Garmin Glass Panel', 'Financing Available', 'Entry Jet'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/CN_Air_Cessna_501_Citation_I_SP.jpg/330px-CN_Air_Cessna_501_Citation_I_SP.jpg' },
  { name: 'Citation I/SP', year: '1977', price: '$885K', category: 'Entry Jet', keywords: ['citation i/sp', 'citation i'], specs: ['6,242 TT', 'Low-Time Engines', 'Entry Jet', 'Classic'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/CN_Air_Cessna_501_Citation_I_SP.jpg/330px-CN_Air_Cessna_501_Citation_I_SP.jpg' },
  { name: 'Piper Meridian', year: '1988', price: '$995K', category: 'Turboprop', keywords: ['meridian', 'piper meridian'], specs: ['2,761 TT', 'Financing Available', 'Single-Engine Turboprop', '5 Passengers'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Piper_PA-46-500TP_Malibu_Meridian_AN1805813.jpg/330px-Piper_PA-46-500TP_Malibu_Meridian_AN1805813.jpg' },
  { name: 'Seneca II', year: '1980', price: '$199,600', category: 'Twin Piston', keywords: ['seneca ii', 'seneca'], specs: ['4,474 TT', 'FIKI Certified', 'Twin Piston', '6 Passengers'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/18/Piper_PA-34_Naples_run_%28cropped%29.jpg/330px-Piper_PA-34_Naples_run_%28cropped%29.jpg' },
  { name: 'Cessna 182 Skylane', year: '1979', price: '$189,500', category: 'Single Piston', keywords: ['skylane', 'cessna 182', '182 skylane'], specs: ['3,709 TT', 'Avidyne/Garmin', '4 Passengers', 'Single Piston'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Cessna182t_skylane_n2231f_cotswoldairshow_2010_arp.jpg/330px-Cessna182t_skylane_n2231f_cotswoldairshow_2010_arp.jpg' },
  { name: 'Beechcraft S35 Bonanza', year: '1965', price: '$99,500', category: 'Classic Piston', keywords: ['bonanza', 's35 bonanza', 'beechcraft s35'], specs: ['6,952 TT', 'V-Tail Classic', 'Single Piston', '4 Passengers'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/48/Beech_Bonanza_Takeoff_%285517383917%29.jpg/330px-Beech_Bonanza_Takeoff_%285517383917%29.jpg' },
  { name: 'Robinson R-44', year: '2002', price: '$198,000', category: 'Helicopter', keywords: ['robinson r-44', 'r-44', 'r44', 'robinson'], specs: ['1,885 hrs', '1,000 Blade Hrs Remaining', 'Helicopter', '3 Passengers'], image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Robinson_R44_II_%28cropped%29.jpg/330px-Robinson_R44_II_%28cropped%29.jpg' },
];

// Chat relay matcher — surfaces aircraft cards when Sophie names a model.
function findMatchingAircraft(text) {
  const lower = String(text || '').toLowerCase();
  return INVENTORY.filter((a) => a.keywords.some((kw) => lower.includes(kw))).slice(0, 3);
}

// How well each category suits a typical leaseback (flight-school / rental /
// club utilization). Trainers and rentals fly the most hours, so they lead.
const LEASEBACK_BASE = {
  'Single Piston': 5,
  'Twin Piston': 5,
  'Classic Piston': 4,
  'Turboprop': 3,
  'Entry Jet': 2,
  'Light Jet': 2,
  'Midsize Jet': 1,
  'Large Cabin Jet': 0,
  'Large Cabin Trijet': 0,
  'Helicopter': 2,
};

// Goal-text signals that nudge specific categories up.
const GOAL_BOOSTS = [
  { re: /train|school|instruct|student|primary|cfi|lesson|learn to fly/i, cats: ['Single Piston', 'Twin Piston', 'Classic Piston'], amt: 3 },
  { re: /rent|club|share|time.?build/i, cats: ['Single Piston', 'Twin Piston', 'Classic Piston', 'Turboprop'], amt: 2 },
  { re: /twin|multi.?engine|multi engine/i, cats: ['Twin Piston'], amt: 3 },
  { re: /charter|part.?135|revenue|commercial/i, cats: ['Turboprop', 'Entry Jet', 'Light Jet', 'Midsize Jet'], amt: 3 },
  { re: /turboprop|king air|meridian|single.?engine turbine/i, cats: ['Turboprop'], amt: 3 },
  { re: /\bjet\b|citation|learjet/i, cats: ['Entry Jet', 'Light Jet', 'Midsize Jet'], amt: 2 },
  { re: /helicopter|rotor|heli\b|r-?44/i, cats: ['Helicopter'], amt: 7 },
];

function leasebackReason(item) {
  switch (item.category) {
    case 'Single Piston':
    case 'Classic Piston':
      return 'A staple flight-school trainer and rental — high hours, strong leaseback utilization.';
    case 'Twin Piston':
      return 'Multi-engine trainer in constant demand for commercial and instrument students.';
    case 'Turboprop':
      return 'Turbine utility and light-charter workhorse — steady revenue potential.';
    case 'Entry Jet':
    case 'Light Jet':
      return 'Entry-level jet suited to light charter and type-training programs.';
    case 'Helicopter':
      return 'Rotor training and tour demand makes for a well-utilized leaseback.';
    default:
      return 'Premium cabin — better suited to charter placement than a training leaseback.';
  }
}

// Goal-aware leaseback matcher: returns up to `limit` inventory aircraft best
// suited to the prospect's stated goal, most relevant first. When the goal is
// blank, the high-utilization trainers/rentals surface by default.
function matchLeasebackAircraft(goal, limit = 3) {
  const text = String(goal || '');
  return INVENTORY.map((item) => {
    let score = LEASEBACK_BASE[item.category] ?? 0;
    for (const b of GOAL_BOOSTS) {
      if (b.re.test(text) && b.cats.includes(item.category)) score += b.amt;
    }
    // Direct model mention in the goal is the strongest signal.
    if (item.keywords.some((kw) => text.toLowerCase().includes(kw))) score += 6;
    return { ...item, url: INVENTORY_URL, score, reason: leasebackReason(item) };
  })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = { INVENTORY, INVENTORY_URL, findMatchingAircraft, matchLeasebackAircraft };
