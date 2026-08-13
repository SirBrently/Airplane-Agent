# JetsWest Leaseback Lead System — Status & Handoff

_Last updated: 2026-08-13_

## TL;DR
The leaseback lead engine is **live and working** on Railway. A prospect's form
submission becomes a ranked local-operator report with matched JetsWest inventory.
Core build is done; what remains is connecting the intake form and (optionally)
turning on email + Airtable.

## Live URLs
- App base: `https://jetswest-relay-production.up.railway.app`
- Health: `/health`
- **Sample report (browser):** `/lead-html?secret=jetswest_webhook_2024&zip=80112`
- Key diagnostic (temp): `/key-check?secret=jetswest_webhook_2024`
- Email template preview: `/email-preview`
- Lead webhook (POST): `/lead?secret=jetswest_webhook_2024`

## Deployment
- Repo: `SirBrently/Airplane-Agent`, deploys from **master** (auto-deploy on push).
- Railway "Wait for CI" is **off** (it was blocking deploys).
- Railway env vars set: `ANTHROPIC_API_KEY`, `JOTFORM_SECRET`, `GOOGLE_PLACES_API_KEY`.
- Google Cloud: **Places API** + **Geocoding API** enabled; key verified working.

## Intake form
- Created in the connected Jotform account: **"JetsWest Leaseback Inquiry"**
- Form ID `262242156920048` — https://form.jotform.com/262242156920048
- Fields: First Name, Last Name, Email, **ZIP**, Primary Goal (dropdown).

## Remaining steps
1. **Wire the Jotform webhook** (manual, in Jotform dashboard):
   Settings → Integrations → Webhooks → add
   `https://jetswest-relay-production.up.railway.app/lead?secret=jetswest_webhook_2024`
2. **Airtable (optional storage):** import the 3 CSV templates, name tables exactly
   `Operators` and `Leads`, then set `AIRTABLE_TOKEN` + `AIRTABLE_BASE_ID` in Railway.
3. **Email delivery (optional):** set `RESEND_API_KEY` (or `SENDGRID_API_KEY`) +
   `LEAD_EMAIL_FROM` in Railway to auto-email each prospect the report.
4. **Send Stan** the status update + sample link (draft ready).
5. **Cleanup (post go-live):** remove temp routes `/key-check` and `/lead-html`
   (server.js), and **restrict the Google API key** in Cloud Console to
   Places + Geocoding.
6. **Website:** publish a `/leaseback` page, then repoint `LEASEBACK_OVERVIEW_URL`
   in `lead-engine.js` (currently the homepage as a fallback).

## How to verify end-to-end
With the webhook set (and Airtable on), submit the form once (ZIP 80112) — a report
generates and a row lands in Airtable's Leads table within seconds.
