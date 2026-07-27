# HarborPress CRM

A lightweight CRM and email/newsletter sender for small nonprofits, built on
Google Sheets and Apps Script — no database to host, no monthly SaaS fee,
just a Sheet you already own.

Part of the [HarborPress](https://harborpress.net) toolkit.

## What it does

- **Contact database** — searchable, taggable by group, with subscribe/unsubscribe
  status and event history, all in a Google Sheet you can open and edit directly.
- **Email sender** — sends newsletters or targeted group emails via
  [Mailtrap](https://mailtrap.io), with dry-run and test-send safeguards
  before anything goes to real recipients.
- **Public subscribe/unsubscribe pages** — static HTML, no server or
  database required beyond the Apps Script backend itself.
- **Optional donor sync** — pulls new donors from Givebutter automatically
  (swappable for another donor platform — see `docs/CONFIG_SETUP.md`).
- **One-click setup** — a single menu action creates every required tab,
  pre-fills every Config key with a description, and adds you as the
  first admin.

## Who this is for

Any small organization that already lives in Google Sheets and wants a
CRM without adopting a whole new platform. This isn't built for scale —
it's built to be understandable, editable, and owned entirely by the
organization running it. No vendor lock-in: it's a Sheet and some script
files you control.

## Quick start

See [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md) for the full step-by-step
setup — roughly:

1. Create a blank Google Sheet, add the six files under `gas/` to its
   Apps Script project.
2. Run **CRM → Setup: Link This Sheet** — this creates every tab and
   Config key for you.
3. Fill in your organization's details in the Config tab.
4. Deploy as a web app, upload the two files under `web/` to your own
   site, and you're running.

Full reference for every Config key, and how to swap Mailtrap or
Givebutter for a different provider, is in
[`docs/CONFIG_SETUP.md`](docs/CONFIG_SETUP.md).

## Repository structure

```
gas/    → Apps Script project files (clasp-managed)
web/    → static files uploaded to your own web host
docs/   → setup guide and full Config reference
```

## Status

This is actively used by a small number of real nonprofit deployments.
Expect rough edges — issues and pull requests welcome.

## License

MIT — see [`LICENSE`](LICENSE).
