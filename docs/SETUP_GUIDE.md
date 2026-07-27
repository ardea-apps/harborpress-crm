# Setup Guide — First-Time Installation

A step-by-step checklist to get this CRM/newsletter system running for a new
organization. For the full list of every Config key and edge cases, see
`CONFIG_SETUP.md`. This guide is the condensed "do this, then this" version.

---

## Before you start

You'll need:
- [ ] A Google account (personal or dedicated — doesn't need to match your
      organization's name or domain; it's just whoever owns the Sheet/script)
- [ ] A Mailtrap account and API key (or another transactional email
      provider — see `CONFIG_SETUP.md` if not using Mailtrap)
- [ ] (Optional) A donor platform API key, if you want automatic donor sync

---

## Step 1 — Create the Google Sheet

1. Create a new, blank Google Sheet.
2. Rename it to something identifiable (e.g. "[Org Name] CRM").

That's it for this step — the tabs themselves are created automatically
in Step 3, not by hand.

## Step 2 — Add the Apps Script project

1. In the Sheet: **Extensions → Apps Script**.
2. Delete the default empty `Code.gs`.
3. Add each of these six files (File → New → Script/HTML as appropriate),
   pasting in the matching content:
   - `crm.gs`
   - `unified_sender.gs`
   - `givebutter_sync.gs`
   - `hash_generator.gs`
   - `crm_login.html`
   - `crm_app.html`
4. Save the project (give it a name if prompted).
5. **Reload the Sheet's browser tab.** This is the step that's easy to
   skip — the custom **SENDER** and **CRM** menus only appear after a
   reload once a script with `onOpen()` is attached.

## Step 3 — Run first-time setup

1. Menu: **CRM → Setup: Link This Sheet**.
2. The first time you run any function in a new script project, Google
   shows an authorization prompt — click through it (Review Permissions
   → choose your account → Advanced → Go to [project name] (unsafe) →
   Allow). This is normal for any unpublished Apps Script project.
3. You should see a "Setup complete" summary alert listing what was created.

This one click:
- Creates the **Contacts** tab with all 15 column headers.
- Creates the **Config** tab with all Config keys pre-listed in column A
  (blank in column B for you to fill in) and a plain-English description
  of each key as a note on hover — check column G, or hover over the
  "Group"/"Send" headers in D1/E1 for what those columns are for.
- Creates the **Admin** tab with your own Google account email already
  added, so you aren't locked out once this is deployed.
- Stores the Sheet's ID in Script Properties, which the deployed web app
  needs since it has no "active spreadsheet" of its own.

Safe to re-run — it skips any tab that already exists rather than
overwriting it.

## Step 4 — Fill in the Config tab

Go to the Config tab. Column A already has every key name listed —
you're just filling in column B values now, not creating structure.

At minimum for a first test, fill in:

| Key (col A) | Value (col B) |
|---|---|
| Org Name | *(your organization's name)* |
| Org Short Code | *(short lowercase id, e.g. "gbr")* |
| From Email | *(the address mail will send from)* |
| Mode | newsletter |
| Sender Name | *(display name for outgoing mail)* |
| Mailtrap API Key | *(your key)* |
| Test Email 1 | *(your own email, for Test Send)* |

Leave `Logo URL`, `Unsubscribe Base URL`, and `Donor API Key` blank for
now — Steps 8, 9, and 11 cover adding these once the basic system is
confirmed working.

In columns D/E (starting row 2), add your organization's group names —
one per row, column E left unchecked for now:

| D | E |
|---|---|
| Volunteer | ☐ |
| Supporter | ☐ |

## Step 5 — Deploy the CRM web app

1. In the Apps Script editor: **Deploy → New Deployment**.
2. Type: **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone**.
5. Click **Deploy**, authorize the requested permissions.
6. Copy the deployment URL.

## Step 6 — Finish the Config tab

Back in the Sheet's Config tab, fill in:

| Key (col A) | Value (col B) |
|---|---|
| CRM Web App URL | *(the URL from Step 5)* |

## Step 7 — Test the CRM app

1. Open the CRM Web App URL directly in your browser (or use
   **CRM → Open CRM** from the Sheet menu).
2. Confirm you're logged in automatically (since your email is in Admin).
3. Confirm the header shows your Org Name (and logo, if you set one).
4. Add a test contact. Confirm it appears in the Contacts tab.
5. Search for it. Edit it. Delete it. Confirm each action reflects in the Sheet.

## Step 8 — Add the logo (optional)

1. In Config, fill in `Logo URL` with a publicly reachable image URL
   (must be a direct image link, not a page containing an image).
2. Reload the CRM Web App URL. Confirm the logo appears in the header,
   replacing the plain Org Name text.
3. Check the login page too (log out, or open in an incognito tab) —
   confirm the logo shows there as well.
4. To confirm the fallback works: temporarily blank the Logo URL value,
   reload, confirm it falls back cleanly to text — then restore the URL.

## Step 9 — Confirm donor sync's off-switch (do this even without a donor platform)

Donor sync is optional. If your organization doesn't use one, this step
confirms it stays quietly off rather than logging errors every night.

1. Confirm Config's `Donor API Key` row is blank.
2. In the Apps Script editor, select `syncDonors` from the function
   dropdown (top toolbar), click **Run**.
3. Check the `Sync Log` tab (created automatically). You should see a new
   row reading *"Donor sync is off (no Donor API Key set in Config).
   Skipping..."* with zeros across Donations/New/Updated/Errors —
   **not** an error entry.

If you do have a donor platform to connect, skip this off-switch check and
go straight to Step 12.

## Step 10 — Test the sender (newsletter mode)

You'll need an HTML file in a Drive folder to send — this can be a simple
test HTML file for now, or a real HarborPress export.

**Before sending:** confirm your Mailtrap sending domain (whatever `From
Email` uses) is verified in your Mailtrap account. Mailtrap requires
domain verification (SPF/DKIM) before it will actually deliver — this is a
one-time setup per domain, done in Mailtrap's own dashboard, not in this code.

**For testing without domain verification:** use Mailtrap's Sandbox mode
instead. Get the sandbox API key and endpoint from Mailtrap's dashboard
(Sandbox → Integration → API), and set `Mailtrap API URL` in Config to
that sandbox endpoint (it includes an inbox-specific ID, e.g.
`https://sandbox.api.mailtrap.io/api/send/1234567` — not just a hostname
swap). Leave `Mailtrap API URL` blank to use production sending normally.

1. Fill in Config: `Drive Folder ID`, `HTML File`, `Subject` (and
   `Mailtrap API URL` if using Sandbox mode — `Mailtrap API Key`,
   `From Email`, `Sender Name`, `Test Email 1` should already be set
   from Step 4).
2. Add a test contact in the Contacts tab with Status = `subscribed`.
3. Run **SENDER → Dry Run** from the Sheet menu. Check the log
   (View → Logs) for the expected recipient count.
4. Run **SENDER → Test Send**. Confirm the test email(s) arrive.
5. Only once both look correct: **SENDER → Send**.

**Double-check key names exactly.** `getConfig()` matches Config keys by
exact string — a typo like "Driver Folder ID" instead of "Drive Folder ID"
fails silently (the value is just never found) rather than throwing an
obvious error. Since Step 3 now pre-populates every key name correctly,
this is much less likely than it used to be — but if Dry Run shows
"HTML found: NO" and you're sure the file exists, check for a typo in
the key name first.

## Step 11 — Set up subscribe/unsubscribe (static HTML)

No PHP, no service account — these are plain static files that call the
same deployed CRM Web App URL from Step 5, via `fetch()`. See
`CONFIG_SETUP.md`'s "Subscribe / unsubscribe architecture" section for
why this replaced the earlier PHP approach.

1. Open `subscribe.html` and `unsubscribe.html`. In each, find
   `const CRM_WEB_APP_URL = '...'` near the top of the `<script>` block
   and paste in this org's deployed Web App URL (same one from Step 5 /
   Config's `CRM Web App URL`).
2. Upload both files anywhere on your web server — no particular folder
   structure required.
3. In Config, fill in `Website URL` and `Privacy Policy URL` (both
   optional, shown on these pages if set) and `Web Subscriber Group`
   (defaults to `Supporter` if blank).
4. Set **Unsubscribe Base URL** in Config to `unsubscribe.html`'s live URL.
5. Test `subscribe.html` directly in your browser — submit a test signup,
   confirm the row appears in your Contacts tab with the right group.
6. Test `unsubscribe.html` by visiting it with `?email=` and a real test
   contact's address appended, confirm the Contacts row updates.
7. On the unsubscribe success screen, confirm the "Unsubscribed by
   mistake? Click here to restore your subscription" link appears and
   works — it flips the contact back to `subscribed` without needing
   the full signup form again.

## Step 12 — Connect a real donor platform (optional)

1. Fill in `Donor API Key` and `Donor Group Name` in Config.
2. Run `syncDonors` manually once from the Apps Script editor
   (select the function, click Run) to confirm it works before scheduling it.
3. Menu: **CRM → Create Daily Sync Trigger**, once confirmed.

---

## If something doesn't work

- **"Sheet ID not set" error** → you skipped Step 3, or ran it before
  reloading the Sheet after adding the script.
- **Menus (CRM/SENDER) don't appear** → make sure all six files from
  Step 2 are present (not just `crm.gs`) — `onOpen()` lives in
  `unified_sender.gs`, so without it no menu exists at all. Then reload
  the Sheet tab in your browser.
- **Tabs weren't created / nothing happened after clicking Setup: Link
  This Sheet** → check the Apps Script editor's Executions log (clock
  icon) for the `linkSheetId` run — a dismissed or failed authorization
  prompt (Step 3.2) is the most common cause.
- **A Config value seems right but the code acts like it's missing** →
  check the exact key spelling in column A against `CONFIG_SETUP.md`.
  `getConfig()` matches by exact string; a typo fails silently rather
  than with an error.
- **Web app shows someone else's data or an old page** → you likely deployed
  a *new* deployment rather than updating the existing one. In Apps
  Script: Deploy → Manage Deployments → edit the existing one → New Version.
- **Login screen loops** → your email isn't in the Admin tab, or isn't typed
  exactly the same as your logged-in Google account's email.

For anything not covered here, see `CONFIG_SETUP.md` for the full key
reference, including how to swap the email provider or donor platform.
