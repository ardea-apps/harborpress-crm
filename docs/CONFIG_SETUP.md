# CRM System — Setup & Configuration Guide

This document covers what a new organization needs to set up before running this
CRM/newsletter system for the first time, and the full list of Config tab keys
the code reads.

---

## What you need before starting

- A Google Sheet, with the Apps Script project (`crm.gs`, `unified_sender.gs`,
  `givebutter_sync.gs`, `hash_generator.gs`, `crm_login.html`, `crm_app.html`)
  bound to it (Extensions → Apps Script).
- A Mailtrap account and API key (or another transactional email provider —
  see "Swapping the email provider" below if not using Mailtrap).
- (Optional) A donor platform API key, if you want automatic donor sync.
  Built-in support is for Givebutter; see "Swapping the donor platform" below.

---

## Required tabs in the Sheet

All three of these are created automatically by **CRM → Setup: Link This
Sheet** (see `SETUP_GUIDE.md`) — this table documents their structure for
reference, not as manual setup instructions.

| Tab name | Purpose |
|---|---|
| **Contacts** | The contact database. See column schema below. |
| **Config** | Key/value settings (columns A/B) plus group list (columns D/E). |
| **Admin** | Authorized CRM users. Column A: email address. Column B: password hash (optional, for the non-Google password fallback). |

The `Contacts` tab has these 15 columns, in this order:

| Col | Field |
|---|---|
| A | Prefix |
| B | First Name |
| C | Last Name |
| D | Company |
| E | Job Title |
| F | Email |
| G | Phone |
| H | Zip Code |
| I | Group |
| J | Events |
| K | Status |
| L | Date Added |
| M | Date Unsubscribed |
| N | Last Issue |
| O | Last Sent |

`Sync Log` and `Duplicates Review` tabs are created automatically by the code
when needed — you don't need to create these yourself.

---

## First-time setup

See `SETUP_GUIDE.md` for the full ordered checklist. In short: add the six
script files, run **CRM → Setup: Link This Sheet** (this creates all three
tabs above automatically, with every Config key pre-listed), fill in the
values, then deploy.

---

## Config tab — columns A/B (key / value)

One key per row. Order doesn't matter — the code reads these by key name.

| Key | Required? | Description |
|---|---|---|
| `Org Name` | Yes | Displayed in the CRM header, login screen, subscribe/unsubscribe pages, and used as a fallback sender name. |
| `Org Short Code` | Recommended | Short lowercase identifier (e.g. `bhs`) used as the CSV export filename prefix. |
| `Logo URL` | No | Public image URL. Shown in the CRM header, login screen, and subscribe/unsubscribe pages. If blank, org name is shown as text instead. |
| `Website URL` | Recommended | This org's homepage. Shown as a link on the subscribe/unsubscribe pages. |
| `Privacy Policy URL` | No | Shown as a link on the subscribe page, if set. |
| `Web Subscriber Group` | No | Group new web subscribers are tagged with. Defaults to `Supporter` if blank. |
| `From Email` | Yes (for sending) | The "from" address on outgoing mail. |
| `Unsubscribe Base URL` | Yes (for newsletter mode) | The live URL of the static `unsubscribe.html` page — `?email=...` is appended automatically. |
| `CRM Web App URL` | Recommended | The deployed CRM web app URL — lets **CRM → Open CRM** work from the spreadsheet menu. |
| `Mode` | Yes | `newsletter` or `email` — controls which recipients `Send`/`Test Send`/`Dry Run` target. |
| `Sender Name` | No | Display name on outgoing mail. Falls back to `Org Name` if blank. |
| `Subject` | Yes (for sending) | Email subject line. |
| `Drive Folder ID` | Yes (for sending) | Google Drive folder ID containing the HTML file to send. |
| `HTML File` | Yes (for sending) | Filename of the HTML file in that Drive folder. |
| `Newsletter Issue` | Yes (newsletter mode only) | An identifier for this issue (e.g. "Vol 2 No 4") — prevents re-sending to someone already marked with this issue. |
| `Mailtrap API Key` | Yes (for sending) | Your Mailtrap sending API key. |
| `Mailtrap API URL` | No | Overrides the default production endpoint (`https://send.api.mailtrap.io/api/send`). Use this for Mailtrap's sandbox/testing mode, whose endpoint includes an inbox-specific ID (e.g. `https://sandbox.api.mailtrap.io/api/send/1234567`) rather than being a simple hostname swap. Leave blank for normal production sending. |
| `Test Email 1` / `2` / `3` | No | Addresses used by **Test Send**. At least one needed to use Test Send. |
| `Donor API Key` | No | Your donor platform's API key. **Leave blank to turn donor sync off** — this is the intended way to disable it, not an error state. |
| `Donor Group Name` | No | Group name applied to synced donors. Defaults to `Donor` if blank. |
| `Last Donor Sync` | No — leave blank | Auto-filled by the code after each sync run. Don't set manually except to backfill (see `givebutter_sync.gs` header comment). |

---

## Config tab — columns D/E (group list)

This is the **single source of truth** for your organization's group taxonomy —
used both by the CRM app (tagging contacts) and the sender (checkbox filter
in Email mode).

| Column D | Column E |
|---|---|
| Group name (row 2 onward) | Checkbox — whether this group is included in the *next* Email-mode send |

Example:

| D | E |
|---|---|
| Board | ☐ |
| Donor | ☑ |
| Volunteer | ☑ |

Add or rename rows here to define your organization's own groups — nothing
in the code needs to change.

---

## Subscribe / unsubscribe architecture (static HTML + GAS backend)

There is no PHP and no service account in this design. `subscribe.html`
and `unsubscribe.html` are plain static files — no server-side code at
all — hosted anywhere on your web server. They call the same deployed
CRM Web App URL that the CRM app itself uses, via `fetch()` GET requests
with an `?action=...` parameter:

- `?action=getOrgInfo` — returns org name/logo/website/privacy URL as
  JSON, so these pages never need per-org edits beyond one URL.
- `?action=subscribe` — adds a new contact, or resubscribes one who was
  previously unsubscribed (requires name + email, same as a fresh signup).
- `?action=resubscribe` — one-click undo for an accidental unsubscribe.
  Only needs an email (no name re-entry) since the contact already
  exists — shown as a link on `unsubscribe.html`'s success screen right
  after someone unsubscribes.
- `?action=unsubscribe` — marks a contact unsubscribed.

These are handled in `crm.gs`'s `doGet(e)`, checked **before** the CRM
app's login/auth gate, since subscribe/unsubscribe must work for
anonymous members of the public, not just logged-in admins.

**Why GET instead of POST:** a `fetch()` POST to a GAS web app runs into
CORS restrictions that block reading the response back — this is the
same issue already solved in the event registration system, using the
same `?action=...` GET pattern.

**Why no service account:** Apps Script already writes to the Sheet as
whoever deployed it ("Execute as: Me") — the same access the CRM app
itself already uses. A service account was only ever needed because the
old PHP approach ran outside Apps Script entirely.

### Setup

1. Upload `subscribe.html` and `unsubscribe.html` anywhere on your web
   server — folder name and location are entirely up to you, since
   there's no relative-path dependency the way the old PHP files had.
2. Open each file, find the line `const CRM_WEB_APP_URL = '...'` near the
   top of the `<script>` block, and paste in this org's deployed Web App
   URL (the same one already in Config's `CRM Web App URL`).
3. In Config, set `Unsubscribe Base URL` to `unsubscribe.html`'s live URL.
4. Set `Website URL`, `Privacy Policy URL`, and `Web Subscriber Group` in
   Config if you want these reflected on the pages (all optional).

See `SETUP_GUIDE.md` for the ordered first-time setup and test steps.

---



`givebutter_sync.gs` is the reference implementation, built for Givebutter.
To integrate a different platform:

1. Replace `fetchDonations()` and `GB_API_URL` with calls to your platform's API.
2. Keep the same return shape from `fetchDonations()`: an array of
   `{ email, first_name, last_name, phone, zip_code }` objects.
3. Everything else — Config keys (`Donor API Key`, `Donor Group Name`),
   writing to Contacts, dedup, and the Sync Log — stays the same.

## Swapping the email provider

`unified_sender.gs`'s `sendViaMailtrap()` is the one function tied to
Mailtrap specifically. Swapping providers means replacing this function's
request format and `MAILTRAP_URL`, while keeping its signature
(`apiKey, fromEmail, toEmail, toName, fromName, subject, htmlBody, unsubscribeUrl`)
so the rest of the sending logic (`dryRun`, `testSend`, `send`) doesn't need
to change.

---

## Known limitations / things not yet generalized

- The CRM's Admin-tab authentication (Google account + password hash
  fallback) is fine for a single organization but has no multi-tenant
  concept — each deployment of this code serves exactly one organization's
  Sheet.
- `subscribe.html` / `unsubscribe.html` are static files, not part of the
  Apps Script project — they need `CRM_WEB_APP_URL` set to this org's
  deployed Web App URL before uploading. See "Subscribe / unsubscribe
  architecture" above.
- The public `?action=subscribe`/`unsubscribe` endpoints have no rate
  limiting — a determined bad actor could script repeated calls. Low risk
  for a small nonprofit CRM, but worth knowing if this is ever exposed to
  a larger, more adversarial audience.
