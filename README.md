# Airplane Agent — Sophie by JetsWest Aviation

> A live AI chat widget for JetsWest Aviation. Sophie is a branded aviation specialist powered by Claude (Anthropic), with real-time streaming responses, aircraft inventory cards, financing guidance, and Zoom booking CTAs.

**Live demo:** https://jetswest-relay-production.up.railway.app/preview

---

## What It Does

Sophie handles the full buyer/seller conversation for a private aviation brokerage:

- Answers questions about buying, selling, financing, and sourcing aircraft
- Matches buyers to inventory based on budget, passenger count, and range
- Surfaces aircraft cards with photos, specs, and pricing in real time
- Drives every conversation toward a Zoom call or financing prequalification
- Speaks in the voice of Stan Snyder and JetsWest Aviation — direct, no fluff

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express 5 |
| AI | Anthropic Claude (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| Streaming | Server-Sent Events (`/stream` endpoint) |
| Deployment | Railway |
| Frontend | Vanilla JS widget (zero dependencies, self-contained) |

---

## Project Structure

```
server.js                  # Full backend — AI relay, inventory, all routes, widget HTML
sophie-widget.html         # Standalone embed snippet (drop into any website)
Sophie-Widget-Install.html # Install guide for Stan's web team
chat-widget.html           # Standalone widget demo
package.json
.railwayignore
```

---

## Endpoints

| Route | Description |
|---|---|
| `GET /preview` | Full preview page with live widget |
| `POST /stream` | Streaming AI endpoint (SSE) — accepts `{ message, sessionId }` |
| `POST /webhook` | Non-streaming fallback (Jotform compatible) |
| `POST /lead` | **Leaseback Inquiry Funnel (Phase 1)** — lead intake + local operator search & report |
| `GET /email-preview?type=day1\|planning` | Preview the §4 follow-up email templates |
| `GET /health` | Health check |
| `GET /img?url=...` | Image proxy for CDN hotlink bypass |

---

## Leaseback Inquiry Funnel — `POST /lead`

Turns a Jotform leaseback submission into a ranked local operator report (`lead-engine.js`).

**Input** — authenticate with the `x-jotform-secret` header **or** a `?secret=` query param (so Jotform's native webhook, which can't set headers, can post directly). Accepts a raw Jotform body (with `rawRequest`) or clean JSON:

```json
{ "firstName": "Jane", "zip": "80112", "email": "jane@example.com", "goal": "leaseback + training", "source": "fb-campaign" }
```

**Direct Jotform wiring (no middleware):** in Jotform → Settings → Integrations → Webhooks, set the URL to:

```
https://jetswest-relay-production.up.railway.app/lead?secret=YOUR_JOTFORM_SECRET
```

Jotform posts its `rawRequest` body; the endpoint parses first name / ZIP / email / goal out of it automatically.

**What it does** (spec §2/§3/§6):
0. **Suggests matching JetsWest aircraft first** — goal-aware picks from inventory (`gojetswest.com`) a prospect could buy and put on leaseback, shown ahead of the operator list.
1. Geocodes the ZIP → lat/long.
2. Finds public-use airports within the radius.
3. Searches nearby operators via Google Places — flight schools, aircraft rental, flying clubs, FBOs, aircraft management.
4. Enriches (website/phone), filters out maintenance-/fuel-/helicopter-only and off-target businesses.
5. Ranks each **Strong Potential Fit / Possible Fit / Secondary Prospect** with a reason.
6. Radius auto-expands **50 → 75 → 100 mi** until at least 5 viable operators are found.
7. **Emails** the branded report to the prospect (if an email provider is configured).
8. **Persists** the lead + upserts operators into Airtable (if configured) — §6 master DB.
9. Returns JSON (`operators[]`, `delivery`, `reportHtml`, `reportText`) — add `?format=html` for the branded report directly, or `?dry=1` to run the search **without** emailing or writing to Airtable.

The email and Airtable steps are **best-effort and optional**: with no keys set, `/lead` behaves exactly as before (returns the report). Errors in either step are captured in the `delivery` field, never failing the request.

**Credibility rule:** operators are labelled *potential* fits only; every report discloses that current demand has **not** been verified by Jets West.

> Airport identifiers are best-effort from Places today; `findAirports()` in `lead-engine.js` is isolated so an authoritative FAA/NASR dataset can be dropped in later.

---

## Widget Features

- **Real-time streaming** — tokens render as they arrive, no wait for full response
- **Aircraft cards** — auto-triggered when Sophie mentions inventory; includes photo, specs, price, and CTA
- **Quick-reply buttons** — 5 opening prompts (Finance, Sell, Sourcing, Leasebacks, Off-Market)
- **AI suggestion chips** — follow-up questions generated after each response
- **Session memory** — conversation history persisted per session (1hr TTL)
- **Dynamic placeholders** — input hint rotates contextually while chatting
- **Mobile responsive** — full-width at ≤420px, 80vh height

---

## Embedding on Any Site

Copy everything between `<!-- START WIDGET -->` and `<!-- END WIDGET -->` in `sophie-widget.html` and paste it just before the closing `</body>` tag of any webpage. No build step, no dependencies.

---

## Environment Variables

```
ANTHROPIC_API_KEY=your_key_here
JOTFORM_SECRET=jetswest_webhook_2024
GOOGLE_PLACES_API_KEY=your_google_places_key   # required for POST /lead

# Optional — POST /lead emails the report if an email provider is set:
RESEND_API_KEY=your_resend_key                 # or SENDGRID_API_KEY
LEAD_EMAIL_FROM=sophie@gojetswest.com          # verified sender address

# Optional — POST /lead stores leads + operators (spec §6) if set:
AIRTABLE_TOKEN=your_airtable_pat
AIRTABLE_BASE_ID=appXXXXXXXXXXXXXX
AIRTABLE_OPERATORS_TABLE=Operators             # optional, this is the default
AIRTABLE_LEADS_TABLE=Leads                     # optional, this is the default

PORT=3000
```

---

## Built By

Brent Cowan — [github.com/SirBrently](https://github.com/SirBrently)
