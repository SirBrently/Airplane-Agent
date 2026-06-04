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
| `GET /health` | Health check |
| `GET /img?url=...` | Image proxy for CDN hotlink bypass |

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
PORT=3000
```

---

## Built By

Brent Cowan — [github.com/SirBrently](https://github.com/SirBrently)
