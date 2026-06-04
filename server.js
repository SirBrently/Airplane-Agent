require('dotenv').config();
const express = require('express');
const cors = require('cors');
const https = require('https');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Per-session conversation history (in-memory, keyed by sessionId)
const sessions = new Map();
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour of inactivity clears session

function getSession(sessionId) {
  const now = Date.now();
  if (!sessionId) return { history: [], lastActive: now };
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, { history: [], lastActive: now });
  }
  const session = sessions.get(sessionId);
  session.lastActive = now;
  return session;
}

// Prune sessions idle longer than TTL
function pruneSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, session] of sessions) {
    if (session.lastActive < cutoff) sessions.delete(id);
  }
}
setInterval(pruneSessions, 15 * 60 * 1000);

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

function findMatchingAircraft(text) {
  const lower = text.toLowerCase();
  return INVENTORY.filter(a => a.keywords.some(kw => lower.includes(kw))).slice(0, 3);
}

const SYSTEM_PROMPT = `You are the voice of JetsWest Aviation — a premier aviation brokerage with over 50 years of experience buying and selling private aircraft. You speak on behalf of Stan Snyder and the JetsWest team.

VOICE & TONE
Speak like Stan: direct, confident, no fluff. You know the market cold. Use aviation industry terminology naturally — turbine time, SMOH, FIKI, RVSM, glass panel, pre-purchase inspection, escrow, dry lease, avionics suite. Skip the pleasantries and get to the point. Brevity is a feature.

CURRENT INVENTORY (as of May 2026)
Jets:
- 2025 Challenger 3500 — $29M | 170.1 hrs, 136 landings | Ultra-long-range large cabin
- 2012 Falcon 900LX — $19M | 14 passengers, MSP Gold engines | Large cabin trijet
- 2008 Learjet 60XR — $1.9M | 3,460 TT | Midsize, 6-passenger, Mach 0.81
- 1988 Beechjet 400 — $875K | 4,890 TT, Garmin avionics | Light jet entry
- 1982 Citation II — $695K | 10 seats, financing from 10% down | Light jet
- 1977 Citation 501SP — $685K or $4,950/mo | 6,847 TT, Garmin glass | Entry jet
- 1977 Citation I/SP — $885K | 6,242 hrs, low-time engines | Entry jet

Turboprops:
- 1988 Piper Meridian — $995K | 2,761 TT, financing available | Single-engine turboprop

Pistons:
- 1980 Seneca II — $199,600 | 4,474 TT, FIKI certified | Twin piston
- 1979 Cessna 182 Skylane — $189,500 | 3,709 TT, Avidyne/Garmin | Single piston
- 1965 Beechcraft S35 Bonanza — $99,500 | 6,952 TT | Classic single piston

Helicopters:
- 2002 Robinson R-44 — $198,000 | 1,885 hrs, 1,000 blade hours remaining

BUYER SEARCH INFERENCE — use this when a client gives incomplete requirements
When a buyer's request is missing details, do NOT just ask open-ended questions. Instead:
1. Map what they told you to the most logical aircraft category and state your inference out loud.
2. Match them to specific aircraft from inventory that fit.
3. Ask for the ONE most important missing piece to confirm or refine.

Inference rules:
- Pax 1-4 + short hops (under 1,000 nm) → entry/light jet (Citation 501SP, Citation I/SP, Beechjet 400)
- Pax 4-7 + mid-range (1,000-2,500 nm) → midsize jet (Learjet 60XR)
- Pax 8-14 + transcontinental/international → large cabin (Falcon 900LX, Challenger 3500)
- Budget-conscious / first-time buyer → piston or turboprop (Meridian, Seneca II, Skylane, Bonanza)
- Budget under $500K → piston category
- Budget $500K-$1.5M → entry jet or turboprop
- Budget $1.5M-$5M → midsize jet
- Budget $5M+ → large cabin

Example: Client says "I need a plane for 6 people from LA to New York." → Infer: transcontinental, 6 pax, ~2,450 nm — that's Learjet 60XR territory at $1.9M, or push up to Falcon 900LX if budget allows. Say so directly.

BUYER GUIDANCE
- Push toward financing prequalification early — don't wait. Ask about budget and financing readiness in the first or second exchange.
- When relevant, mention the QuietMarket pipeline: JetsWest's access to off-market aircraft not listed publicly. This is a key differentiator — use it.
- Always offer to schedule a Zoom call: gojetswest.com/booking-calander

SELLER GUIDANCE
- Guide sellers toward JetsWest's 30-day listing guarantee. Emphasize the buyer network and marketing reach.
- Always offer to schedule a Zoom call: gojetswest.com/booking-calander

FORMATTING RULES — always follow these
- NEVER use markdown tables. Ever. Format inventory lists like this instead:
  ✈ **Learjet 60XR** (2008) — **$1.9M**
  3,460 TT · 6 Passengers · Mach 0.81
- Use a blank line between each aircraft entry
- Use ✈ for jets, 🔩 for turboprops, 🛩 for pistons, 🚁 for helicopters
- Keep section headers bold: **Jets**, **Turboprops**, etc.
- Never use HTML. Never use markdown tables or horizontal rules (---).

CONVERSATION RULES
- NEVER tell a client to "scroll up", "as mentioned", "as I said", or reference that a topic was already covered. Every question deserves a full, fresh response regardless of conversation history.
- If a client asks about the same topic twice, treat it as an opportunity to go deeper — add more detail, ask a follow-up question, or push toward a next step like scheduling a call.
- Never be dismissive. Every message is a warm lead.

HARD RULES — never break these under any circumstances:
- NEVER invent, estimate, or speculate on aircraft specs, total time, SMOH, avionics configurations, or maintenance status beyond what is listed above. If you don't have confirmed data, say so: "I'd want to pull the actual logbooks on that before giving you a number — let's get on a call." Then point to gojetswest.com/booking-calander
- NEVER give tax advice, depreciation guidance, or legal advice of any kind. Direct those questions to their CPA or aviation attorney.
- NEVER promise or imply specific financing rates, terms, or lender approval. You can say financing is available and encourage prequalification.
- NEVER badmouth competitors or specific aircraft models.

Keep responses concise — this is a chat interface, not a brochure. One or two focused paragraphs max unless the question demands more.`;

async function generateSuggestions(reply) {
  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 120,
      system: 'Generate exactly 3 short follow-up questions a prospect might ask next in an aviation sales conversation. Return ONLY a valid JSON array of 3 strings. Each under 8 words. No explanation — just the JSON array.',
      messages: [{ role: 'user', content: `Based on this reply, give 3 follow-up questions: "${reply.slice(0, 500)}"` }],
    });
    const parsed = JSON.parse(resp.content[0]?.text?.trim());
    return Array.isArray(parsed) ? parsed.slice(0, 3) : null;
  } catch { return null; }
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'jetswest-relay' });
});

app.get('/preview', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sophie — JetsWest AI Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: #060e1a;
    min-height: 100vh;
    font-family: 'Inter', -apple-system, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .preview-header {
    position: fixed;
    top: 0; left: 0; right: 0;
    background: rgba(6,14,26,0.95);
    border-bottom: 1px solid rgba(201,168,76,0.2);
    padding: 14px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    backdrop-filter: blur(8px);
    z-index: 99998;
  }
  .preview-logo {
    color: #e8c96a;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
  .preview-body {
    text-align: center;
    max-width: 480px;
    padding-top: 80px;
  }
  .preview-title {
    color: #fff;
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 12px;
    letter-spacing: -0.01em;
  }
  .preview-title span { color: #e8c96a; }
  .preview-sub {
    color: rgba(255,255,255,0.4);
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 32px;
  }
  .preview-hint {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 12px 20px;
    color: rgba(255,255,255,0.35);
    font-size: 13px;
  }
  .hint-arrow {
    color: #e8c96a;
    font-size: 18px;
    animation: bounce 1.5s ease-in-out infinite;
  }
  @keyframes bounce {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(4px); }
  }
</style>
</head>
<body>

<div class="preview-header">
  <div class="preview-logo">JetsWest Aviation</div>
</div>

<div class="preview-body">
  <div class="preview-title">Meet <span>Sophie</span></div>
  <p class="preview-sub">
    Your JetsWest AI aviation specialist. Ask about buying, selling, financing, sourcing, or our current inventory.
  </p>
  <div class="preview-hint">
    <span class="hint-arrow">↘</span>
    Chat is open in the bottom-right corner
  </div>
</div>

<!-- ── WIDGET ── -->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');
  #jw-widget * { box-sizing: border-box; margin: 0; padding: 0; }
  #jw-widget { position: fixed; bottom: 28px; right: 28px; z-index: 99999; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
  #jw-bubble { position: absolute; bottom: 78px; right: 0; width: 230px; background: #0c1626; border: 1px solid rgba(201,168,76,0.4); border-radius: 14px; padding: 13px 14px; box-shadow: 0 8px 32px rgba(0,0,0,0.45); cursor: pointer; opacity: 1; transform: translateY(0); transition: opacity 0.35s ease, transform 0.35s ease; }
  #jw-bubble::after { content: ''; position: absolute; bottom: -8px; right: 22px; width: 14px; height: 14px; background: #0c1626; border-right: 1px solid rgba(201,168,76,0.4); border-bottom: 1px solid rgba(201,168,76,0.4); transform: rotate(45deg); }
  #jw-bubble.hidden { opacity: 0; transform: translateY(8px); pointer-events: none; }
  #jw-bubble-text { color: #e4e4e4; font-size: 13px; line-height: 1.5; padding-right: 18px; }
  #jw-bubble-text strong { color: #e8c96a; }
  #jw-bubble-dismiss { position: absolute; top: 8px; right: 10px; background: none; border: none; color: rgba(255,255,255,0.3); font-size: 14px; cursor: pointer; line-height: 1; padding: 2px; transition: color 0.2s; }
  #jw-bubble-dismiss:hover { color: #c9a84c; }
  #jw-toggle { width: 66px; height: 66px; border-radius: 50%; background: linear-gradient(145deg, #1b2e55, #0c1626); border: 2px solid #c9a84c; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 6px 24px rgba(201,168,76,0.35); transition: transform 0.2s ease, box-shadow 0.2s ease; margin-left: auto; position: relative; }
  #jw-toggle:hover { transform: scale(1.07); box-shadow: 0 8px 30px rgba(201,168,76,0.5); }
  #jw-toggle .icon-close { display: none; }
  #jw-toggle .icon-chat { animation: jwIconPulse 2s ease-in-out infinite; }
  @keyframes jwIconPulse { 0%, 100% { transform: scale(1); filter: drop-shadow(0 0 2px rgba(201,168,76,0.3)); } 50% { transform: scale(1.22); filter: drop-shadow(0 0 8px rgba(201,168,76,1)); } }
  #jw-toggle.pulse::before { content: ''; position: absolute; inset: -4px; border-radius: 50%; border: 2px solid rgba(201,168,76,0.5); animation: jwPulse 2s ease-out infinite; }
  @keyframes jwPulse { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(1.4); opacity: 0; } }
  #jw-badge { position: absolute; top: -3px; right: -3px; width: 18px; height: 18px; background: #e8c96a; color: #0c1626; border-radius: 50%; font-size: 10px; font-weight: 700; display: none; align-items: center; justify-content: center; border: 2px solid #0c1626; }
  #jw-window { position: absolute; bottom: 78px; right: 0; width: 375px; height: 560px; background: #0c1626; border: 1px solid rgba(201,168,76,0.25); border-radius: 20px; display: none; flex-direction: column; overflow: hidden; box-shadow: 0 24px 64px rgba(0,0,0,0.65); animation: jwSlideUp 0.25s ease; }
  #jw-window.open { display: flex; }
  @keyframes jwSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
  #jw-header { background: linear-gradient(135deg, #1b2e55 0%, #0e1f3d 100%); border-bottom: 1px solid rgba(201,168,76,0.2); padding: 14px 16px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  #jw-header-avatar { width: 56px; height: 56px; border-radius: 50%; border: 2px solid rgba(201,168,76,0.5); background: linear-gradient(135deg, #1b2e55, #0c1626); overflow: hidden; flex-shrink: 0; }
  #jw-header-avatar img { width: 100%; height: 100%; object-fit: cover; object-position: center top; display: block; }
  #jw-header-info { flex: 1; min-width: 0; }
  #jw-header-info h3 { color: #fff; font-size: 15px; font-weight: 600; letter-spacing: 0.02em; }
  #jw-header-info .jw-status { display: flex; align-items: center; gap: 5px; margin-top: 2px; }
  #jw-header-info .jw-dot { width: 7px; height: 7px; border-radius: 50%; background: #4ade80; flex-shrink: 0; }
  #jw-header-info .jw-status-text { color: rgba(255,255,255,0.55); font-size: 11.5px; }
  #jw-close { background: none; border: none; color: rgba(255,255,255,0.35); cursor: pointer; font-size: 22px; line-height: 1; padding: 4px; transition: color 0.2s; flex-shrink: 0; }
  #jw-close:hover { color: #c9a84c; }
  #jw-messages { flex: 1; overflow-y: auto; padding: 16px 14px; display: flex; flex-direction: column; gap: 10px; scroll-behavior: smooth; }
  #jw-messages::-webkit-scrollbar { width: 4px; }
  #jw-messages::-webkit-scrollbar-track { background: transparent; }
  #jw-messages::-webkit-scrollbar-thumb { background: rgba(201,168,76,0.25); border-radius: 4px; }
  .jw-msg { max-width: 86%; padding: 11px 14px; border-radius: 16px; font-size: 15px; line-height: 1.65; word-break: break-word; }
  .jw-msg.bot { background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.09); color: #e4e4e4; border-bottom-left-radius: 4px; align-self: flex-start; }
  .jw-msg.user { background: linear-gradient(135deg, #1b2e55, #243a6b); border: 1px solid rgba(201,168,76,0.3); color: #fff; border-bottom-right-radius: 4px; align-self: flex-end; }
  .jw-msg.bot strong { color: #e8c96a; font-weight: 600; }
  .jw-msg.bot em { color: rgba(255,255,255,0.75); font-style: italic; }
  .jw-msg.bot a { color: #e8c96a; text-decoration: underline; text-underline-offset: 2px; }
  .jw-msg.bot a:hover { color: #fff; }
  .jw-msg.bot ul { list-style: none; margin-top: 6px; display: flex; flex-direction: column; gap: 4px; }
  .jw-msg.bot ul li::before { content: '›'; color: #c9a84c; font-weight: 700; margin-right: 6px; }
  .jw-msg.bot ul li { color: #e4e4e4; }
  .jw-typing { display: flex; align-items: center; gap: 5px; padding: 12px 14px; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.09); border-radius: 16px; border-bottom-left-radius: 4px; align-self: flex-start; width: fit-content; }
  .jw-typing span { width: 7px; height: 7px; background: #c9a84c; border-radius: 50%; animation: jwBounce 1.2s infinite; opacity: 0.7; }
  .jw-typing span:nth-child(2) { animation-delay: 0.2s; }
  .jw-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes jwBounce { 0%, 60%, 100% { transform: translateY(0); opacity: 0.7; } 30% { transform: translateY(-6px); opacity: 1; } }
  #jw-nav-bar { display: flex; gap: 7px; padding: 7px 13px; border-top: 1px solid rgba(255,255,255,0.05); background: rgba(0,0,0,0.12); flex-shrink: 0; }
  .jw-nav-btn { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.45); font-size: 12px; font-family: inherit; padding: 5px 13px; border-radius: 20px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
  .jw-nav-btn:hover { background: rgba(201,168,76,0.1); border-color: rgba(201,168,76,0.35); color: #e8c96a; }
  #jw-input-row { padding: 11px 13px; border-top: 1px solid rgba(201,168,76,0.12); display: flex; gap: 9px; align-items: flex-end; background: rgba(0,0,0,0.15); flex-shrink: 0; }
  #jw-input { flex: 1; background: rgba(255,255,255,0.06); border: 1px solid rgba(201,168,76,0.2); border-radius: 11px; padding: 10px 13px; color: #fff; font-size: 13.5px; font-family: inherit; resize: none; outline: none; line-height: 1.45; max-height: 100px; transition: border-color 0.2s; }
  #jw-input::placeholder { color: rgba(255,255,255,0.28); }
  #jw-input:focus { border-color: rgba(201,168,76,0.5); }
  #jw-send { width: 40px; height: 40px; border-radius: 11px; background: linear-gradient(135deg, #c9a84c, #e8c96a); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: opacity 0.2s, transform 0.15s; }
  #jw-send:hover { opacity: 0.88; transform: scale(1.05); }
  #jw-send:disabled { opacity: 0.4; cursor: default; transform: none; }
  #jw-quick-replies { display: flex; flex-direction: column; align-items: center; gap: 8px; margin-top: 10px; width: 100%; }
  .jw-quick-btn { background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.35); border-radius: 12px; color: #ffffff; font-size: 15px; font-family: inherit; font-weight: 500; padding: 16px 20px; cursor: pointer; text-align: center; display: block; width: 78%; transition: background 0.18s, border-color 0.18s, transform 0.12s; letter-spacing: 0.01em; line-height: 1.3; }
  .jw-quick-btn:hover { background: rgba(201,168,76,0.18); border-color: rgba(201,168,76,0.7); transform: scale(1.03); }
  .jw-inv-list { display: flex; flex-direction: column; gap: 7px; margin: 6px 0; width: 100%; }
  .jw-inv-item { background: rgba(201,168,76,0.06); border: 1px solid rgba(201,168,76,0.18); border-radius: 10px; padding: 9px 12px; font-size: 13.5px; color: #e8e8e8; line-height: 1.4; }
  .jw-inv-item strong { color: #e8c96a; }
  .jw-inv-stats { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 3px; }
  .jw-timestamp { font-size: 10.5px; color: rgba(255,255,255,0.25); text-align: center; margin: 2px 0 4px; letter-spacing: 0.02em; }
  .jw-plane-card-img.loading { background: linear-gradient(90deg, #1a2744 25%, #243a6b 50%, #1a2744 75%); background-size: 200% 100%; animation: jwShimmer 1.4s infinite; }
  @keyframes jwShimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
  .jw-cards-row { display: flex; flex-direction: column; gap: 10px; width: 100%; margin-top: 4px; }
  .jw-plane-card { background: linear-gradient(160deg, #1a2a4a 0%, #0c1626 100%); border: 1px solid rgba(201,168,76,0.3); border-radius: 14px; overflow: hidden; width: 100%; }
  .jw-plane-card-img { width: 100%; height: 150px; object-fit: cover; display: block; background: #1a2744; }
  .jw-plane-card-body { padding: 12px 14px 14px; }
  .jw-plane-card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
  .jw-plane-card-name { color: #fff; font-size: 14.5px; font-weight: 600; line-height: 1.3; }
  .jw-plane-card-price { color: #e8c96a; font-size: 17px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .jw-plane-card-badge { display: inline-block; background: rgba(201,168,76,0.12); border: 1px solid rgba(201,168,76,0.28); color: #c9a84c; font-size: 10.5px; font-weight: 500; padding: 2px 9px; border-radius: 20px; margin-bottom: 9px; letter-spacing: 0.02em; }
  .jw-plane-card-specs { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 11px; }
  .jw-plane-spec-chip { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.65); font-size: 11px; padding: 3px 9px; border-radius: 6px; }
  .jw-plane-card-cta { width: 100%; background: linear-gradient(135deg, #c9a84c, #e8c96a); color: #0c1626; border: none; border-radius: 9px; padding: 10px; font-size: 13px; font-weight: 700; cursor: pointer; letter-spacing: 0.02em; transition: opacity 0.2s, transform 0.15s; }
  .jw-plane-card-cta:hover { opacity: 0.88; transform: scale(1.01); }
  #jw-footer { text-align: center; padding: 6px 0 8px; font-size: 10.5px; color: rgba(255,255,255,0.18); letter-spacing: 0.03em; flex-shrink: 0; }
  .jw-suggestion-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; padding: 0 2px; }
  .jw-chip-btn { background: rgba(201,168,76,0.08); border: 1px solid rgba(201,168,76,0.3); border-radius: 20px; color: #e8c96a; font-size: 12px; font-family: inherit; padding: 5px 12px; cursor: pointer; transition: background 0.15s, border-color 0.15s; white-space: nowrap; }
  .jw-chip-btn:hover { background: rgba(201,168,76,0.18); border-color: rgba(201,168,76,0.6); }
  @media (max-width: 420px) { #jw-window { width: calc(100vw - 24px); right: 0; height: 80vh; } #jw-widget { bottom: 16px; right: 12px; } }
</style>

<div id="jw-widget">
  <div id="jw-window">
    <div id="jw-header">
      <div id="jw-header-avatar">
        <img src="https://images.pexels.com/photos/8171192/pexels-photo-8171192.jpeg?auto=compress&cs=tinysrgb&w=200&h=200&fit=crop&crop=faces" alt="Sophie" loading="eager" />
      </div>
      <div id="jw-header-info">
        <h3>Sophie · JetsWest Aviation</h3>
        <div class="jw-status"><div class="jw-dot"></div><span class="jw-status-text">Aviation Specialist · Online</span></div>
      </div>
      <button id="jw-close" title="Close">✕</button>
    </div>
    <div id="jw-messages"></div>
    <div id="jw-nav-bar">
      <button class="jw-nav-btn" id="jw-btn-back">← Back</button>
      <button class="jw-nav-btn" id="jw-btn-menu">🏠 Main Menu</button>
    </div>
    <div id="jw-input-row">
      <textarea id="jw-input" rows="1" placeholder="Ask about aircraft, pricing, or your mission…"></textarea>
      <button id="jw-send">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0c1626" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    </div>
    <div id="jw-footer">Powered by JetsWest AI</div>
  </div>
  <div id="jw-bubble" class="hidden">
    <button id="jw-bubble-dismiss" title="Dismiss">✕</button>
    <p id="jw-bubble-text"><strong>Hi, I'm Sophie!</strong> Looking to buy, sell, or finance an aircraft? I can help.</p>
  </div>
  <button id="jw-toggle" title="Chat with Sophie" class="pulse">
    <div id="jw-badge"></div>
    <svg class="icon-chat" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
    <svg class="icon-close" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#c9a84c" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
  </button>
</div>

<script>
(function () {
  const WEBHOOK = 'https://jetswest-relay-production.up.railway.app/stream';
  const SECRET  = 'jetswest_webhook_2024';
  let sessionId = localStorage.getItem('jw_session');
  if (!sessionId) { sessionId = 'jw-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('jw_session', sessionId); }
  const toggle = document.getElementById('jw-toggle');
  const iconChat = toggle.querySelector('.icon-chat');
  const iconClose = toggle.querySelector('.icon-close');
  const badge = document.getElementById('jw-badge');
  const window_ = document.getElementById('jw-window');
  const closeBtn = document.getElementById('jw-close');
  const messages = document.getElementById('jw-messages');
  const input = document.getElementById('jw-input');
  const send = document.getElementById('jw-send');
  const bubble = document.getElementById('jw-bubble');
  const bubbleDismiss = document.getElementById('jw-bubble-dismiss');
  let isOpen = false, greeted = false, bubbleDismissed = false, unreadCount = 0;
  const placeholders = ['Ask about aircraft, pricing, or your mission…','What\\'s your passenger count and range?','Looking to buy, sell, or finance?','Ask about off-market inventory…','What\\'s your budget range?'];
  let phIndex = 0;
  setInterval(() => { if (!isOpen) return; phIndex = (phIndex + 1) % placeholders.length; input.placeholder = placeholders[phIndex]; }, 4000);
  bubble.addEventListener('click', () => { bubble.classList.add('hidden'); openChat(); });
  bubbleDismiss.addEventListener('click', (e) => { e.stopPropagation(); bubbleDismissed = true; bubble.classList.add('hidden'); });
  function openChat() {
    isOpen = true; unreadCount = 0; badge.style.display = 'none'; badge.textContent = ''; toggle.classList.remove('pulse');
    window_.classList.add('open'); iconChat.style.display = 'none'; iconClose.style.display = 'block'; bubble.classList.add('hidden'); input.focus();
    if (!greeted) { greeted = true; appendBot("JetsWest Aviation here. What can I help you with today?"); appendQuickReplies(['Aircraft Finance & Funding','Sell or List Your Airplane','Sourcing & Acquisitions','Cash Flowing Leasebacks','Off-Market Quiet Transactions']); }
  }
  function closeChat() {
    isOpen = false; window_.classList.remove('open'); iconChat.style.display = 'block'; iconClose.style.display = 'none';
    if (!bubbleDismissed) bubble.classList.remove('hidden');
  }
  toggle.addEventListener('click', () => isOpen ? closeChat() : openChat());
  closeBtn.addEventListener('click', closeChat);
  document.getElementById('jw-btn-back').addEventListener('click', () => {
    const kids = Array.from(messages.children);
    for (let i = kids.length - 1; i >= 0; i--) { const el = kids[i]; if (el.classList.contains('jw-cards-row') || el.classList.contains('jw-timestamp')) { el.remove(); continue; } if (el.classList.contains('jw-msg') && el.classList.contains('bot')) { el.remove(); break; } break; }
  });
  document.getElementById('jw-btn-menu').addEventListener('click', () => {
    messages.innerHTML = ''; greeted = false; unreadCount = 0; badge.style.display = 'none';
    sessionId = 'jw-' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('jw_session', sessionId); openChat();
  });
  function renderMarkdown(text) {
    let html = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    html = html.replace(/\\[([^\\]]+)\\]\\((https?:\\/\\/[^\\)]+)\\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
    html = html.replace(/(^|[\\s])(https?:\\/\\/[^\\s<]+)/g,'$1<a href="$2" target="_blank" rel="noopener">$2</a>');
    html = html.replace(/\\*\\*(.+?)\\*\\*/g,'<strong>$1</strong>');
    html = html.replace(/\\*(.+?)\\*/g,'<em>$1</em>');
    html = html.replace(/^\\|.+\\|$/gm,'').replace(/^\\|[-| :]+\\|$/gm,'');
    const lines = html.split('\\n'); const out = []; let inList = false, inInventory = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]; const trimmed = line.trim();
      if (/^[✈🔩🛩🚁]/.test(trimmed)) {
        if (!inInventory) { if (inList) { out.push('</ul>'); inList = false; } out.push('<div class="jw-inv-list">'); inInventory = true; }
        const nextLine = (lines[i+1]||'').trim(); const hasStats = nextLine && !/^[✈🔩🛩🚁\\*#-]/.test(nextLine) && nextLine !== '';
        out.push('<div class="jw-inv-item">'+trimmed+(hasStats?'<div class="jw-inv-stats">'+nextLine+'</div>':'')+'</div>');
        if (hasStats) i++; continue;
      }
      if (inInventory && trimmed === '') { continue; }
      if (inInventory) { out.push('</div>'); inInventory = false; }
      const bullet = trimmed.match(/^[-•]\\s+(.+)/);
      if (bullet) { if (!inList) { out.push('<ul>'); inList = true; } out.push('<li>'+bullet[1]+'</li>'); }
      else { if (inList) { out.push('</ul>'); inList = false; } if (trimmed) out.push(trimmed); else out.push(''); }
    }
    if (inList) out.push('</ul>'); if (inInventory) out.push('</div>');
    return out.join('\\n').replace(/\\n{2,}/g,'</p><p>').replace(/\\n/g,'<br>');
  }
  function addTimestamp() { const ts = document.createElement('div'); ts.className = 'jw-timestamp'; ts.textContent = new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); messages.appendChild(ts); }
  function appendBot(text) {
    addTimestamp(); const div = document.createElement('div'); div.className = 'jw-msg bot'; div.innerHTML = renderMarkdown(text); messages.appendChild(div);
    setTimeout(() => div.scrollIntoView({behavior:'smooth',block:'start'}),50);
    if (!isOpen) { unreadCount++; badge.textContent = unreadCount; badge.style.display = 'flex'; toggle.classList.add('pulse'); }
    return div;
  }
  function appendUser(text) { const div = document.createElement('div'); div.className = 'jw-msg user'; div.textContent = text; messages.appendChild(div); messages.scrollTop = messages.scrollHeight; return div; }
  function renderCards(cards) {
    if (!cards||!cards.length) return;
    const row = document.createElement('div'); row.className = 'jw-cards-row';
    cards.forEach(c => {
      const card = document.createElement('div'); card.className = 'jw-plane-card';
      card.innerHTML = '<img class="jw-plane-card-img loading" src="'+c.image+'" alt="'+c.name+'" loading="lazy" onload="this.classList.remove(\\'loading\\')" onerror="this.classList.remove(\\'loading\\');this.style.background=\\'#1a2744\\';this.style.minHeight=\\'150px\\'"/><div class="jw-plane-card-body"><div class="jw-plane-card-top"><div><div class="jw-plane-card-name">'+c.year+' '+c.name+'</div></div><div class="jw-plane-card-price">'+c.price+'</div></div><div class="jw-plane-card-badge">'+c.category+'</div><div class="jw-plane-card-specs">'+c.specs.map(s=>'<span class="jw-plane-spec-chip">'+s+'</span>').join('')+'</div><button class="jw-plane-card-cta">Inquire About This Aircraft</button></div>';
      card.querySelector('.jw-plane-card-cta').addEventListener('click',()=>{ input.value='I\\'d like to learn more about the '+c.year+' '+c.name; sendMessage(); });
      row.appendChild(card);
    });
    messages.appendChild(row); setTimeout(()=>row.firstChild.scrollIntoView({behavior:'smooth',block:'start'}),50);
  }
  function appendQuickReplies(options) {
    const wrapper = document.createElement('div'); wrapper.id = 'jw-quick-replies';
    options.forEach(label => { const btn = document.createElement('button'); btn.className = 'jw-quick-btn'; btn.textContent = label; btn.addEventListener('click',()=>{ wrapper.remove(); input.value=label; sendMessage(); }); wrapper.appendChild(btn); });
    messages.appendChild(wrapper); messages.scrollTop = messages.scrollHeight;
  }
  function appendSuggestionChips(items) {
    if (!items||!items.length) return;
    const wrapper = document.createElement('div'); wrapper.className = 'jw-suggestion-chips';
    items.forEach(label => { const btn = document.createElement('button'); btn.className = 'jw-chip-btn'; btn.textContent = label; btn.addEventListener('click',()=>{ wrapper.remove(); input.value=label; sendMessage(); }); wrapper.appendChild(btn); });
    messages.appendChild(wrapper); messages.scrollTop = messages.scrollHeight;
  }
  function showTyping() { const t = document.createElement('div'); t.className = 'jw-typing'; t.innerHTML = '<span></span><span></span><span></span>'; messages.appendChild(t); messages.scrollTop = messages.scrollHeight; return t; }
  async function sendMessage() {
    const text = input.value.trim(); if (!text) return;
    input.value = ''; input.style.height = 'auto'; send.disabled = true; appendUser(text);
    const typing = showTyping(); let botDiv = null, rawText = '';
    try {
      const res = await fetch(WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json','x-jotform-secret':SECRET},body:JSON.stringify({message:text,sessionId})});
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buffer = '';
      while (true) {
        const {done,value} = await reader.read(); if (done) break;
        buffer += decoder.decode(value,{stream:true});
        const lines = buffer.split('\\n'); buffer = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          let ev; try { ev = JSON.parse(line.slice(6)); } catch { continue; }
          if (ev.type==='token') {
            if (!botDiv) { typing.remove(); addTimestamp(); botDiv=document.createElement('div'); botDiv.className='jw-msg bot'; messages.appendChild(botDiv); if(!isOpen){unreadCount++;badge.textContent=unreadCount;badge.style.display='flex';toggle.classList.add('pulse');} }
            rawText+=ev.text; botDiv.textContent=rawText; messages.scrollTop=messages.scrollHeight;
          } else if (ev.type==='done') {
            if (botDiv) { botDiv.innerHTML=renderMarkdown(rawText); setTimeout(()=>botDiv.scrollIntoView({behavior:'smooth',block:'start'}),50); }
            if (ev.cards) renderCards(ev.cards);
            if (ev.sessionId) { sessionId=ev.sessionId; localStorage.setItem('jw_session',sessionId); }
          } else if (ev.type==='suggestions') {
            appendSuggestionChips(ev.items);
          } else if (ev.type==='error') {
            if (typing.parentNode) typing.remove(); appendBot(ev.message||'Something went wrong — please try again.');
          }
        }
      }
    } catch { if (typing.parentNode) typing.remove(); appendBot('Connection issue — please try again in a moment.'); }
    send.disabled = false; input.focus();
  }
  send.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendMessage(); } });
  input.addEventListener('input', () => { input.style.height='auto'; input.style.height=Math.min(input.scrollHeight,100)+'px'; });
  // Auto-open on preview page
  setTimeout(() => openChat(), 600);
})();
</script>
</body>
</html>`);
});

// Image proxy — fetches CDN images with gojetswest.com referrer to bypass hotlink protection
app.get('/img', (req, res) => {
  const url = req.query.url;
  if (!url || !url.startsWith('https://le-cdn.website-editor.net/')) {
    return res.status(400).send('Invalid URL');
  }
  const options = {
    headers: {
      'Referer': 'https://www.gojetswest.com/',
      'User-Agent': 'Mozilla/5.0'
    }
  };
  https.get(url, options, (upstream) => {
    if (upstream.statusCode !== 200) {
      return res.status(upstream.statusCode).send('Image unavailable');
    }
    res.set('Content-Type', upstream.headers['content-type'] || 'image/png');
    res.set('Cache-Control', 'public, max-age=86400');
    upstream.pipe(res);
  }).on('error', () => res.status(500).send('Fetch error'));
});

app.post('/stream', async (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  res.flushHeaders();
  const sse = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  if (req.headers['x-jotform-secret'] !== process.env.JOTFORM_SECRET) {
    sse({ type: 'error', message: 'Unauthorized' }); return res.end();
  }

  const { message, sessionId } = parseJotformBody(req.body);
  if (!message?.trim()) { sse({ type: 'error', message: 'No message provided' }); return res.end(); }

  console.log(`[stream] sessionId=${sessionId || 'none'} message="${message.trim().slice(0, 80)}"`);

  const session = getSession(sessionId);
  session.history.push({ role: 'user', content: message.trim() });
  if (session.history.length > 20) session.history = session.history.slice(-20);

  try {
    let fullReply = '';
    const stream = client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: session.history,
    });

    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.type === 'text_delta') {
        const text = chunk.delta.text;
        fullReply += text;
        sse({ type: 'token', text });
      }
    }

    session.history.push({ role: 'assistant', content: fullReply });
    if (sessionId) sessions.set(sessionId, session);

    const cards = findMatchingAircraft(fullReply);
    sse({ type: 'done', cards: cards.length ? cards : undefined, sessionId: sessionId || undefined });

    // Suggestions fire after done — chips appear ~1s after the full response
    const suggestions = await generateSuggestions(fullReply);
    if (suggestions) sse({ type: 'suggestions', items: suggestions });
    res.end();
  } catch (err) {
    session.history.pop();
    console.error('[stream] error:', err.message);
    sse({ type: 'error', message: 'Failed to generate response' });
    res.end();
  }
});

function parseJotformBody(body) {
  if (body && typeof body.message === 'string') {
    return { message: body.message, sessionId: body.sessionId || null };
  }

  if (body && typeof body.rawRequest === 'string') {
    try {
      const parsed = JSON.parse(body.rawRequest);
      return {
        message: parsed.message || parsed.query || parsed.text || null,
        sessionId: parsed.sessionId || body.sessionId || null,
      };
    } catch {
      // rawRequest wasn't valid JSON — fall through
    }
  }

  const message =
    body?.query || body?.text || body?.userMessage || body?.input || null;
  return { message, sessionId: body?.sessionId || null };
}

app.post('/webhook', async (req, res) => {
  console.log('[webhook] headers:', {
    'content-type': req.headers['content-type'],
    'x-jotform-secret': req.headers['x-jotform-secret'] ? '***' : '(missing)',
  });
  console.log('[webhook] body:', JSON.stringify(req.body, null, 2));

  const incomingSecret = req.headers['x-jotform-secret'];
  if (incomingSecret !== process.env.JOTFORM_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { message, sessionId } = parseJotformBody(req.body);

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'No message provided' });
  }

  console.log(`[webhook] sessionId=${sessionId || 'none'} message="${message.trim().slice(0, 80)}"`);

  const session = getSession(sessionId);
  session.history.push({ role: 'user', content: message.trim() });

  // Keep last 20 turns to avoid token bloat
  if (session.history.length > 20) {
    session.history = session.history.slice(session.history.length - 20);
  }

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: session.history,
    });

    const reply = response.content[0]?.text || '';
    session.history.push({ role: 'assistant', content: reply });

    if (sessionId) sessions.set(sessionId, session);

    const cards = findMatchingAircraft(reply);
    console.log(`[webhook] reply="${reply.slice(0, 80)}..." cards=${cards.length}`);
    res.json({ reply, cards: cards.length ? cards : undefined, sessionId: sessionId || undefined });
  } catch (err) {
    // Remove the user message we added if Claude failed, so history stays clean
    session.history.pop();
    console.error('[webhook] Claude API error:', err.message);
    res.status(500).json({ error: 'Failed to generate response', details: err.message });
  }
});

app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`JetsWest relay running on port ${PORT}`);
});
