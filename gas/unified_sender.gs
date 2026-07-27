// ============================================================
// Unified Email & Newsletter Sender
// Google Apps Script — Mailtrap REST API transport
// ============================================================
//
// ── CONTACTS TAB STRUCTURE ───────────────────────────────────
//   See the shared C{} column map defined in crm.gs.
//
// ── CONFIG TAB ───────────────────────────────────────────────
//   A/B columns — key/value settings. See CONFIG_SETUP.md for
//   the full list of keys this system reads.
//
//   D/E columns — group name / checkbox (email mode only).
//   This same column also defines the org's group taxonomy,
//   read directly by crm.gs — one list, no duplication.
//
// ── MERGE TAGS ───────────────────────────────────────────────
//   {{PREFIX}}           → contact prefix
//   {{FIRST_NAME}}       → contact first name
//   {{LAST_NAME}}        → contact last name
//   {{COMPANY}}          → contact company
//   {{UNSUBSCRIBE_URL}}  → unsubscribe link (newsletter only)
//
// ── MENU ─────────────────────────────────────────────────────
//   Sender > Dry Run / Test Send / Send
//
// NOTE: doesn't redeclare the Contacts column map — this file
// refers to C.xxx (from crm.gs) only inside function bodies,
// never as a top-level constant, since GAS file load order
// across a project isn't guaranteed and top-level cross-file
// const references would be fragile.
// ============================================================

const MAILTRAP_URL = 'https://send.api.mailtrap.io/api/send';

// Config can override this with 'Mailtrap API URL' — e.g. a sandbox
// endpoint like https://sandbox.api.mailtrap.io/api/send/<inbox_id>,
// which includes an inbox-specific ID and isn't just a hostname swap.
function getMailtrapUrl(config) {
  const override = (config['Mailtrap API URL'] || '').toString().trim();
  return override || MAILTRAP_URL;
}

// ============================================================
// CUSTOM MENU
// ============================================================
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('SENDER')
    .addItem('Dry Run',   'dryRun')
    .addItem('Test Send', 'testSend')
    .addSeparator()
    .addItem('Send',      'send')
    .addToUi();

  ui.createMenu('CRM')
    .addItem('Setup: Link This Sheet', 'linkSheetId')
    .addSeparator()
    .addItem('Open CRM',       'openCRM')
    .addItem('Generate Hash',  'generateHash')
    .addSeparator()
    .addItem('Sync Donors Now',           'syncDonors')
    .addItem('Create Daily Sync Trigger', 'createDailyTrigger')
    .addSeparator()
    .addItem('Find Duplicates',             'findDuplicates')
    .addItem('Confirm Delete Duplicates',   'confirmDeleteDuplicates')
    .addToUi();
}

function openCRM() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const config = getConfig(ss);
  const url    = config['CRM Web App URL'];
  if (!url) {
    SpreadsheetApp.getUi().alert('CRM Web App URL not set in Config tab. Deploy the web app first, then paste its URL into Config.');
    return;
  }
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family:Arial,sans-serif;padding:24px;text-align:center;">' +
    '<p style="margin-bottom:16px;color:#333;">Click below to open the CRM in a new tab:</p>' +
    '<a href="' + url + '" target="_blank" ' +
    'style="display:inline-block;padding:11px 22px;background:#0a2d6e;color:#fff;' +
    'text-decoration:none;border-radius:6px;font-weight:600;">Open CRM</a>' +
    '</div>'
  ).setWidth(320).setHeight(140);
  SpreadsheetApp.getUi().showModalDialog(html, 'Open CRM');
}

// ============================================================
// CONFIG READER — shared by crm.gs, unified_sender.gs, givebutter_sync.gs
// ============================================================
function getConfig(ss) {
  const sheet = ss.getSheetByName('Config');
  if (!sheet) throw new Error('"Config" tab not found.');
  const data   = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 0; i < data.length; i++) {
    const key = (data[i][0] || '').toString().trim();
    const val = (data[i][1] || '').toString().trim();
    if (key) config[key] = val;
  }
  return config;
}

// ============================================================
// GROUP READER — reads checked groups from Config cols D/E
// ============================================================
function getSelectedGroups(ss) {
  const sheet = ss.getSheetByName('Config');
  if (!sheet) throw new Error('"Config" tab not found.');
  const data   = sheet.getDataRange().getValues();
  const groups = [];
  for (let i = 1; i < data.length; i++) {
    const groupName = (data[i][3] || '').toString().trim();
    const checked   = data[i][4];
    if (groupName && checked === true) groups.push(groupName);
  }
  return groups;
}

// ============================================================
// DRIVE HTML READER
// ============================================================
function getHtmlFromDrive(folderId, fileName) {
  try {
    const folder = DriveApp.getFolderById(folderId);
    const files  = folder.getFilesByName(fileName);
    if (files.hasNext()) {
      return files.next().getBlob().getDataAsString('UTF-8');
    }
  } catch (err) {
    Logger.log('Drive error: ' + err.message);
  }
  return null;
}

// ============================================================
// MAILTRAP TRANSPORT
// ============================================================
function sendViaMailtrap(apiUrl, apiKey, fromEmail, toEmail, toName, fromName, subject, htmlBody, unsubscribeUrl) {
  const payload = {
    from:    { email: fromEmail, name: fromName },
    to:      [{ email: toEmail, name: toName }],
    subject: subject,
    html:    htmlBody
  };

  if (unsubscribeUrl) {
    payload.headers = {
      'List-Unsubscribe':      '<' + unsubscribeUrl + '>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
    };
  }

  const options = {
    method:             'post',
    contentType:        'application/json',
    headers:            { Authorization: 'Bearer ' + apiKey },
    payload:            JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(apiUrl, options);
  const code     = response.getResponseCode();
  const body     = response.getContentText();

  if (code === 429) throw new Error('RATE_LIMIT');
  if (code !== 200) throw new Error('Mailtrap error ' + code + ': ' + body);
  return true;
}

// ============================================================
// RECIPIENT FILTER
// ============================================================
function getRecipients(ss, config, mode, issue, selectedGroups) {
  const sheet = ss.getSheetByName('Contacts');
  if (!sheet) throw new Error('"Contacts" tab not found.');
  const data  = sheet.getDataRange().getValues();

  const recipients = [];

  for (let i = 1; i < data.length; i++) {
    const row       = data[i];
    const email     = (row[C.email]     || '').toString().trim();
    const prefix    = (row[C.prefix]    || '').toString().trim();
    const firstName = (row[C.firstName] || 'Friend').toString().trim();
    const lastName  = (row[C.lastName]  || '').toString().trim();
    const company   = (row[C.company]   || '').toString().trim();
    const status    = (row[C.status]    || '').toString().trim().toLowerCase();
    const lastIssue = (row[C.lastIssue] || '').toString().trim();
    const groupCell = (row[C.group]     || '').toString();

    if (!email) continue;

    if (mode === 'newsletter') {
      if (status !== 'subscribed') continue;
      if (issue && lastIssue === issue) continue;
      recipients.push({ rowIndex: i, email, prefix, firstName, lastName, company });

    } else {
      if (selectedGroups.length === 0) continue;
      const contactGroups = groupCell.split(',').map(g => g.trim());
      const match = selectedGroups.some(sg => contactGroups.includes(sg));
      if (!match) continue;
      recipients.push({ rowIndex: i, email, prefix, firstName, lastName, company });
    }
  }

  return recipients;
}

// ============================================================
// MERGE TAG REPLACEMENT
// ============================================================
function applyMergeTags(html, r, unsubUrl) {
  return html
    .replace(/{{PREFIX}}/g,          r.prefix)
    .replace(/{{FIRST_NAME}}/g,      r.firstName)
    .replace(/{{LAST_NAME}}/g,       r.lastName)
    .replace(/{{COMPANY}}/g,         r.company)
    .replace(/{{UNSUBSCRIBE_URL}}/g, unsubUrl || '');
}

// ============================================================
// DRY RUN
// ============================================================
function dryRun() {
  const ss       = SpreadsheetApp.getActiveSpreadsheet();
  const config   = getConfig(ss);
  const mode     = (config['Mode'] || 'newsletter').toLowerCase().trim();
  const issue    = config['Newsletter Issue'];
  const selectedGroups = mode === 'email' ? getSelectedGroups(ss) : [];

  const html = getHtmlFromDrive(config['Drive Folder ID'], config['HTML File']);

  Logger.log('=== DRY RUN ===');
  Logger.log('Mode:         ' + mode);
  Logger.log('API URL:      ' + getMailtrapUrl(config));
  Logger.log('Subject:      ' + config['Subject']);
  Logger.log('HTML File:    ' + config['HTML File']);
  Logger.log('API Key set:  ' + (config['Mailtrap API Key'] ? 'YES' : 'NO'));
  Logger.log('HTML found:   ' + (html ? 'YES (' + html.length + ' chars)' : 'NO'));
  if (mode === 'newsletter') Logger.log('Issue:        ' + (issue || '(not set)'));
  if (mode === 'email')      Logger.log('Groups:       ' + (selectedGroups.length ? selectedGroups.join(', ') : '(none checked)'));

  const recipients = getRecipients(ss, config, mode, issue, selectedGroups);
  Logger.log('Recipients:   ' + recipients.length);
  recipients.forEach((r, idx) => {
    Logger.log('  [' + (idx + 1) + '] ' + r.email + ' — ' + r.prefix + ' ' + r.firstName + ' ' + r.lastName);
  });
  Logger.log('=== END DRY RUN ===');
  SpreadsheetApp.getUi().alert('Dry Run complete — ' + recipients.length + ' recipient(s) found.\nCheck Logs (View → Logs) for details.');
}

// ============================================================
// TEST SEND
// ============================================================
function testSend() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const config    = getConfig(ss);
  const mode      = (config['Mode'] || 'newsletter').toLowerCase().trim();
  const apiKey    = config['Mailtrap API Key'];
  const apiUrl    = getMailtrapUrl(config);
  const fromName  = config['Sender Name'] || config['Org Name'] || 'Newsletter';
  const fromEmail = config['From Email'];
  const unsubBase = config['Unsubscribe Base URL'];

  if (!apiKey)    throw new Error('Mailtrap API Key missing from Config tab.');
  if (!fromEmail) throw new Error('From Email missing from Config tab.');

  const html = getHtmlFromDrive(config['Drive Folder ID'], config['HTML File']);
  if (!html)  throw new Error('HTML file not found in Drive. Check filename: ' + config['HTML File']);

  const testAddresses = [
    config['Test Email 1'],
    config['Test Email 2'],
    config['Test Email 3']
  ].filter(e => e && e.length > 0);

  if (testAddresses.length === 0) throw new Error('No test email addresses in Config tab.');

  for (const email of testAddresses) {
    const r = { prefix: '', firstName: email.split('@')[0], lastName: '', company: '' };
    const unsubUrl = (mode === 'newsletter' && unsubBase)
      ? unsubBase + '?email=' + encodeURIComponent(email)
      : null;

    sendViaMailtrap(apiUrl, apiKey, fromEmail, email, r.firstName, fromName, '[TEST] ' + config['Subject'], applyMergeTags(html, r, unsubUrl), unsubUrl);
    Logger.log('Test sent to: ' + email);
    Utilities.sleep(300);
  }

  SpreadsheetApp.getUi().alert('Test send complete — ' + testAddresses.length + ' email(s) sent.');
}

// ============================================================
// SEND
// ============================================================
function send() {
  const ss        = SpreadsheetApp.getActiveSpreadsheet();
  const config    = getConfig(ss);
  const mode      = (config['Mode'] || 'newsletter').toLowerCase().trim();
  const apiKey    = config['Mailtrap API Key'];
  const apiUrl    = getMailtrapUrl(config);
  const fromName  = config['Sender Name'] || config['Org Name'] || 'Newsletter';
  const fromEmail = config['From Email'];
  const unsubBase = config['Unsubscribe Base URL'];
  const issue     = config['Newsletter Issue'];
  const selectedGroups = mode === 'email' ? getSelectedGroups(ss) : [];

  if (!apiKey)    throw new Error('Mailtrap API Key missing from Config tab.');
  if (!fromEmail) throw new Error('From Email missing from Config tab.');
  if (mode === 'newsletter' && !issue) throw new Error('Newsletter Issue missing from Config tab.');
  if (mode === 'email' && selectedGroups.length === 0) {
    SpreadsheetApp.getUi().alert('No groups selected.\nCheck at least one group in Config columns D/E before sending.');
    return;
  }

  const html = getHtmlFromDrive(config['Drive Folder ID'], config['HTML File']);
  if (!html) throw new Error('HTML file not found in Drive. Check filename: ' + config['HTML File']);

  const recipients = getRecipients(ss, config, mode, issue, selectedGroups);
  if (recipients.length === 0) {
    SpreadsheetApp.getUi().alert('No recipients found.\nCheck Mode, Status, and group checkboxes in Config.');
    return;
  }

  const contactSheet = ss.getSheetByName('Contacts');
  let sent = 0, failed = 0;

  for (const r of recipients) {
    const unsubUrl = (mode === 'newsletter' && unsubBase)
      ? unsubBase + '?email=' + encodeURIComponent(r.email)
      : null;

    try {
      sendViaMailtrap(
        apiUrl,
        apiKey,
        fromEmail,
        r.email,
        (r.firstName + ' ' + r.lastName).trim(),
        fromName,
        config['Subject'],
        applyMergeTags(html, r, unsubUrl),
        unsubUrl
      );

      const sheetRow = r.rowIndex + 1;
      const now      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      if (mode === 'newsletter') {
        contactSheet.getRange(sheetRow, C.lastIssue + 1).setValue(issue);
      }
      contactSheet.getRange(sheetRow, C.lastSent + 1).setValue(now);

      sent++;
      Logger.log('Sent [' + sent + ']: ' + r.email);

    } catch (err) {
      if (err.message === 'RATE_LIMIT') {
        const msg = '⚠️ Mailtrap rate limit reached.\n\n'
          + 'Sent this run: ' + sent + '\n'
          + 'Remaining: ' + (recipients.length - sent - failed) + '\n\n'
          + 'Wait one hour, then run Send again.';
        SpreadsheetApp.getUi().alert('Rate Limit Reached', msg, SpreadsheetApp.getUi().ButtonSet.OK);
        return;
      }
      Logger.log('FAILED: ' + r.email + ' — ' + err.message);
      failed++;
    }

    Utilities.sleep(300);
  }

  const summary = '✅ Send complete.\n\nSent: ' + sent + '\nFailed: ' + failed;
  Logger.log(summary);
  SpreadsheetApp.getUi().alert(summary);
}

// NOTE: the GAS-based unsubscribe doGet() that used to live in this
// file has been removed. Unsubscribe is handled by unsubscribe.php
// (writes to this Sheet via the service account), not by this script.
