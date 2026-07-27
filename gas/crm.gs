// ============================================================
// CRM — Web App
// ============================================================
// FILES REQUIRED IN APPS SCRIPT PROJECT:
//   crm.gs             — this file (server-side logic, shared column map)
//   crm_login.html     — login page
//   crm_app.html       — main app page
//   unified_sender.gs  — shared Config reader, email sending
//   givebutter_sync.gs — optional donor sync (swappable — see its own header)
//   hash_generator.gs  — admin password hash helper
//
// FIRST-TIME SETUP:
//   1. Open this spreadsheet, run CRM → Setup: Link This Sheet
//      (one-time — stores this Sheet's ID in Script Properties so
//      the deployed web app knows which Sheet to open; a web app
//      has no "active spreadsheet" the way a bound script does)
//   2. Fill in the Config tab — see CONFIG_SETUP.md for the full
//      list of keys this system reads
//   3. Deploy → New Deployment → Web App
//      Execute as: Me
//      Who has access: Anyone
//   4. Copy the deployment URL into Config tab's "CRM Web App URL"
// ============================================================

// Contacts column indices (0-based) — shared across all files.
// Referenced as C.xxx inside functions only (never at top level
// in other files), since GAS file load order isn't guaranteed.
const C = {
  prefix:    0,   // A
  firstName: 1,   // B
  lastName:  2,   // C
  company:   3,   // D
  jobTitle:  4,   // E
  email:     5,   // F
  phone:     6,   // G
  zipcode:   7,   // H
  group:     8,   // I
  events:    9,   // J
  status:    10,  // K
  dateAdded: 11,  // L
  dateUnsub: 12,  // M
  lastIssue: 13,  // N
  lastSent:  14   // O
};

// ============================================================
// SHEET ID — stored in Script Properties, not hardcoded.
// A deployed web app has no "active spreadsheet" context, so it
// needs to be told explicitly which Sheet to open.
// ============================================================
function getSheetId() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!id) {
    throw new Error('Sheet ID not set. Run CRM → Setup: Link This Sheet from the spreadsheet menu first.');
  }
  return id;
}

function linkSheetId() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const created = [];
  const skipped = [];

  // ------------------------------------------------------------
  // Contacts tab
  // ------------------------------------------------------------
  if (!ss.getSheetByName('Contacts')) {
    const sheet = ss.insertSheet('Contacts');
    const headers = [
      'Prefix', 'First Name', 'Last Name', 'Company', 'Job Title',
      'Email', 'Phone', 'Zip Code', 'Group', 'Events', 'Status',
      'Date Added', 'Date Unsubscribed', 'Last Issue', 'Last Sent'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold').setBackground('#0a2d6e').setFontColor('#ffffff');
    sheet.setFrozenRows(1);
    created.push('Contacts');
  } else {
    skipped.push('Contacts (already exists)');
  }

  // ------------------------------------------------------------
  // Config tab — headers plus every key this system reads, blank
  // in column B for you to fill in. Existing Config tabs are left
  // untouched so this is safe to re-run.
  // ------------------------------------------------------------
  if (!ss.getSheetByName('Config')) {
    const sheet = ss.insertSheet('Config');
    sheet.getRange(1, 1, 1, 7).setValues([['Key', 'Value', '', 'Group', 'Send', '', 'Description']]);
    sheet.getRange(1, 4).setNote(
      "Add your organization's group names below (starting row 2), one per row.\n\n" +
      "This is the single source of truth for your group taxonomy — the CRM app " +
      "uses this same list for tagging contacts, and the sender uses it for the " +
      "Email-mode checkboxes below."
    );
    sheet.getRange(1, 5).setNote(
      "Check the box next to any group you want included in the NEXT Email-mode " +
      "send (Mode = \"email\"). Ignored in Newsletter mode."
    );
    sheet.getRange(1, 1, 1, 7)
      .setFontWeight('bold').setBackground('#0a2d6e').setFontColor('#ffffff');

    const defaultKeys = [
      ['Org Name', 'Displayed in the CRM header, login screen, subscribe/unsubscribe pages, and used as a fallback sender name.'],
      ['Org Short Code', 'Short lowercase identifier (e.g. bhs) used as the CSV export filename prefix.'],
      ['Logo URL', 'Public image URL. Shown in the CRM header, login screen, and subscribe/unsubscribe pages. Leave blank to show org name as text instead.'],
      ['Website URL', "This org's homepage. Shown as a link on the subscribe/unsubscribe pages."],
      ['Privacy Policy URL', 'Shown as a link on the subscribe page, if set. Optional.'],
      ['Web Subscriber Group', 'Group new web subscribers are tagged with. Defaults to "Supporter" if blank.'],
      ['From Email', 'The "from" address on outgoing mail.'],
      ['Unsubscribe Base URL', 'Live URL of the static unsubscribe.html page. ?email=... is appended automatically.'],
      ['CRM Web App URL', 'The deployed CRM web app URL — lets CRM → Open CRM work from the spreadsheet menu.'],
      ['Mode', '"newsletter" or "email" — controls which recipients Send/Test Send/Dry Run target.'],
      ['Sender Name', 'Display name on outgoing mail. Falls back to Org Name if blank.'],
      ['Subject', 'Email subject line.'],
      ['Drive Folder ID', 'Google Drive folder ID containing the HTML file to send.'],
      ['HTML File', 'Filename of the HTML file in that Drive folder.'],
      ['Newsletter Issue', 'An identifier for this issue (e.g. "Vol 2 No 4") — prevents re-sending to someone already marked with this issue.'],
      ['Mailtrap API Key', 'Your Mailtrap sending API key.'],
      ['Mailtrap API URL', "Optional override for Mailtrap's sandbox/testing endpoint. Leave blank for normal production sending."],
      ['Test Email 1', 'Address used by Test Send. At least one Test Email needed to use it.'],
      ['Test Email 2', 'Additional address used by Test Send. Optional.'],
      ['Test Email 3', 'Additional address used by Test Send. Optional.'],
      ['Donor API Key', "Your donor platform's API key. Leave BLANK to turn donor sync off — this is intentional, not an error."],
      ['Donor Group Name', 'Group name applied to synced donors. Defaults to "Donor" if blank.'],
      ['Last Donor Sync', "Auto-filled by the code after each sync run. Don't set manually except to backfill historical donors."],
      ['Show HarborPress Credit', 'Shows a small "Crafted with HarborPress" credit across the CRM, login, and subscribe/unsubscribe pages. Set to "no" to hide it. Shown by default.']
    ];
    sheet.getRange(2, 1, defaultKeys.length, 1).setValues(defaultKeys.map(k => [k[0]]));
    sheet.getRange(2, 7, defaultKeys.length, 1).setValues(defaultKeys.map(k => [k[1]]));
    sheet.setFrozenRows(1);
    sheet.autoResizeColumn(7);
    created.push('Config (with ' + defaultKeys.length + ' default keys and descriptions — fill in column B)');
  } else {
    skipped.push('Config (already exists)');
  }

  // ------------------------------------------------------------
  // Admin tab — your own email added automatically so you aren't
  // locked out once this is deployed.
  // ------------------------------------------------------------
  if (!ss.getSheetByName('Admin')) {
    const sheet = ss.insertSheet('Admin');
    sheet.getRange(1, 1, 1, 2).setValues([['Email', 'Password Hash']]);
    sheet.getRange(1, 1, 1, 2)
      .setFontWeight('bold').setBackground('#0a2d6e').setFontColor('#ffffff');
    const currentUser = Session.getActiveUser().getEmail();
    if (currentUser) sheet.getRange(2, 1).setValue(currentUser);
    sheet.setFrozenRows(1);
    created.push('Admin' + (currentUser ? ' (with your email added)' : ''));
  } else {
    skipped.push('Admin (already exists)');
  }

  // ------------------------------------------------------------
  // Sheet ID — stored so the deployed web app knows which Sheet
  // to open (a web app has no "active spreadsheet" of its own).
  // ------------------------------------------------------------
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', ss.getId());

  let summary = 'Setup complete.\n\n';
  if (created.length) summary += 'Created:\n' + created.map(s => '  • ' + s).join('\n') + '\n\n';
  if (skipped.length) summary += 'Already existed (left untouched):\n' + skipped.map(s => '  • ' + s).join('\n') + '\n\n';
  summary += 'This sheet is now linked — the CRM web app will read/write it.';

  ui.alert('Setup: Initialize This Sheet', summary, ui.ButtonSet.OK);
}

function openSS() {
  return SpreadsheetApp.openById(getSheetId());
}

// ============================================================
// GROUPS — read from Config tab column D (the same list used
// for the sender's group checkboxes). One list, two consumers —
// a new org edits column D once to define their own taxonomy.
// ============================================================
function getGroups(ss) {
  const sheet = ss.getSheetByName('Config');
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  const groups = [];
  for (let i = 1; i < data.length; i++) {
    const name = (data[i][3] || '').toString().trim(); // column D
    if (name) groups.push(name);
  }
  return groups;
}

// ============================================================
// WEB APP ENTRY POINT
// ============================================================
function doGet(e) {
  // Public, unauthenticated endpoints — called by anonymous visitors
  // from the static subscribe/unsubscribe pages, checked BEFORE the
  // CRM app's auth gate below, since these must work for the public.
  const params = (e && e.parameter) || {};
  const action = params.action || '';

  if (action === 'getOrgInfo')  return handleGetOrgInfo();
  if (action === 'subscribe')   return handleSubscribe(params);
  if (action === 'unsubscribe') return handleUnsubscribe(params);
  if (action === 'resubscribe') return handleResubscribe(params);

  const ss     = openSS();
  const config = getConfig(ss); // defined in unified_sender.gs
  const orgName = config['Org Name'] || 'CRM';
  const userEmail = Session.getActiveUser().getEmail();
  // Default ON — orgs opt out, they don't opt in. Only an explicit
  // "no" hides it.
  const showCredit = (config['Show HarborPress Credit'] || '').toString().trim().toLowerCase() !== 'no';

  if (!isAuthorised(userEmail, ss)) {
    const loginTemplate = HtmlService.createTemplateFromFile('crm_login');
    loginTemplate.orgName = orgName;
    loginTemplate.logoUrl = config['Logo URL'] || '';
    loginTemplate.showCredit = showCredit;
    return loginTemplate.evaluate()
      .setTitle(orgName + ' — Login')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const template = HtmlService.createTemplateFromFile('crm_app');
  template.userEmail    = userEmail;
  template.groups       = JSON.stringify(getGroups(ss));
  template.orgName      = orgName;
  template.orgShortCode = config['Org Short Code'] || 'crm';
  template.logoUrl      = config['Logo URL'] || '';
  template.showCredit   = showCredit;
  return template.evaluate()
    .setTitle(orgName)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ============================================================
// PUBLIC ENDPOINTS — subscribe / unsubscribe / org branding info
// No authentication — these are called by anonymous site visitors
// from static subscribe.html / unsubscribe.html pages via fetch().
// Replaces the old PHP + service account approach: Apps Script
// already has direct Sheet access as the deploying account, so no
// separate credential is needed for these writes.
// ============================================================

function jsonOutput(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function handleGetOrgInfo() {
  const ss     = openSS();
  const config = getConfig(ss);
  return jsonOutput({
    success:    true,
    orgName:    config['Org Name'] || '',
    logoUrl:    config['Logo URL'] || '',
    websiteUrl: config['Website URL'] || '',
    privacyUrl: config['Privacy Policy URL'] || '',
    showCredit: (config['Show HarborPress Credit'] || '').toString().trim().toLowerCase() !== 'no'
  });
}

function handleSubscribe(params) {
  const email     = (params.email     || '').toString().trim();
  const firstName = (params.firstName || '').toString().trim();
  const lastName  = (params.lastName  || '').toString().trim();
  const phone     = (params.phone     || '').toString().trim();
  const zipcode   = (params.zipcode   || '').toString().trim();

  if (!firstName) return jsonOutput({ success: false, message: 'First name is required.' });
  if (!lastName)  return jsonOutput({ success: false, message: 'Last name is required.' });
  if (!email || !isValidEmail(email)) {
    return jsonOutput({ success: false, message: 'A valid email address is required.' });
  }

  const ss       = openSS();
  const config   = getConfig(ss);
  const sheet    = ss.getSheetByName('Contacts');
  const data     = sheet.getDataRange().getValues();
  const webGroup = config['Web Subscriber Group'] || 'Supporter';
  const now      = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  for (let i = 1; i < data.length; i++) {
    const rowEmail = (data[i][C.email] || '').toString().trim().toLowerCase();
    if (rowEmail === email.toLowerCase()) {
      const status = (data[i][C.status] || '').toString().trim().toLowerCase();
      if (status === 'unsubscribed') {
        const row = i + 1;
        sheet.getRange(row, C.status    + 1).setValue('subscribed');
        sheet.getRange(row, C.dateAdded + 1).setValue(now);
        sheet.getRange(row, C.dateUnsub + 1).setValue('');
        return jsonOutput({ success: true, message: 'resubscribed' });
      }
      return jsonOutput({ success: false, message: 'exists' });
    }
  }

  const newRow = [
    '',           // A Prefix
    firstName,    // B First Name
    lastName,     // C Last Name
    '',           // D Company
    '',           // E Job Title
    email,        // F Email
    phone,        // G Phone
    zipcode,      // H Zip Code
    webGroup,     // I Group
    '',           // J Events
    'subscribed', // K Status
    now,          // L Date Added
    '',           // M Date Unsubscribed
    '',           // N Last Issue
    ''            // O Last Sent
  ];
  sheet.appendRow(newRow);
  return jsonOutput({ success: true, message: 'new' });
}

function handleUnsubscribe(params) {
  const email = (params.email || '').toString().trim();
  if (!email || !isValidEmail(email)) {
    return jsonOutput({ success: false, message: 'invalid' });
  }

  const ss    = openSS();
  const sheet = ss.getSheetByName('Contacts');
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowEmail = (data[i][C.email] || '').toString().trim().toLowerCase();
    if (rowEmail === email.toLowerCase()) {
      const status = (data[i][C.status] || '').toString().trim().toLowerCase();
      if (status === 'unsubscribed') {
        return jsonOutput({ success: false, message: 'already' });
      }
      const row = i + 1;
      const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      sheet.getRange(row, C.status    + 1).setValue('unsubscribed');
      sheet.getRange(row, C.dateUnsub + 1).setValue(now);
      return jsonOutput({ success: true });
    }
  }

  return jsonOutput({ success: false, message: 'not_found' });
}

function handleResubscribe(params) {
  const email = (params.email || '').toString().trim();
  if (!email || !isValidEmail(email)) {
    return jsonOutput({ success: false, message: 'invalid' });
  }

  const ss    = openSS();
  const sheet = ss.getSheetByName('Contacts');
  const data  = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const rowEmail = (data[i][C.email] || '').toString().trim().toLowerCase();
    if (rowEmail === email.toLowerCase()) {
      const status = (data[i][C.status] || '').toString().trim().toLowerCase();
      if (status === 'subscribed') {
        return jsonOutput({ success: false, message: 'already_subscribed' });
      }
      const row = i + 1;
      const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
      sheet.getRange(row, C.status    + 1).setValue('subscribed');
      sheet.getRange(row, C.dateAdded + 1).setValue(now);
      sheet.getRange(row, C.dateUnsub + 1).setValue('');
      return jsonOutput({ success: true });
    }
  }

  return jsonOutput({ success: false, message: 'not_found' });
}

// ============================================================
// AUTH
// ============================================================
function isAuthorised(email, ss) {
  if (!email) return false;
  const sheet = (ss || openSS()).getSheetByName('Admin');
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim().toLowerCase() === email.toLowerCase()) return true;
  }
  return false;
}

function checkPassword(password) {
  const sheet = openSS().getSheetByName('Admin');
  if (!sheet) return false;
  const data = sheet.getDataRange().getValues();
  const hash = hashPassword(password);
  for (let i = 1; i < data.length; i++) {
    if ((data[i][1] || '').toString().trim() === hash) return true;
  }
  return false;
}

function hashPassword(password) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    password,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function loginWithPassword(password) {
  return checkPassword(password);
}

// ============================================================
// CRM API
// ============================================================
function searchContacts(query, eventCode) {
  const sheet = openSS().getSheetByName('Contacts');
  const data  = sheet.getDataRange().getValues();
  const q     = (query     || '').toLowerCase().trim();
  const ev    = (eventCode || '').trim();
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];

    if (q) {
      const searchStr = [
        row[C.firstName], row[C.lastName], row[C.email],
        row[C.company], row[C.group]
      ].join(' ').toLowerCase();
      if (!searchStr.includes(q)) continue;
    }

    if (ev) {
      const contactEvents = (row[C.events] || '').toString()
        .split(',').map(e => e.trim());
      if (!contactEvents.includes(ev)) continue;
    }

    results.push({
      rowIndex:  i + 1,
      prefix:    String(row[C.prefix]    || ''),
      firstName: String(row[C.firstName] || ''),
      lastName:  String(row[C.lastName]  || ''),
      company:   String(row[C.company]   || ''),
      jobTitle:  String(row[C.jobTitle]  || ''),
      email:     String(row[C.email]     || ''),
      phone:     String(row[C.phone]     || ''),
      zipcode:   String(row[C.zipcode]   || ''),
      group:     String(row[C.group]     || ''),
      events:    String(row[C.events]    || ''),
      status:    String(row[C.status]    || ''),
      dateAdded: String(row[C.dateAdded] || ''),
      lastIssue: String(row[C.lastIssue] || ''),
      lastSent:  String(row[C.lastSent]  || '')
    });
  }
  return results;
}

function getContact(rowIndex) {
  const sheet = openSS().getSheetByName('Contacts');
  const row   = sheet.getRange(rowIndex, 1, 1, 15).getValues()[0];
  return {
    rowIndex:  rowIndex,
    prefix:    String(row[C.prefix]    || ''),
    firstName: String(row[C.firstName] || ''),
    lastName:  String(row[C.lastName]  || ''),
    company:   String(row[C.company]   || ''),
    jobTitle:  String(row[C.jobTitle]  || ''),
    email:     String(row[C.email]     || ''),
    phone:     String(row[C.phone]     || ''),
    zipcode:   String(row[C.zipcode]   || ''),
    group:     String(row[C.group]     || ''),
    events:    String(row[C.events]    || ''),
    status:    String(row[C.status]    || ''),
    dateAdded: String(row[C.dateAdded] || ''),
    dateUnsub: String(row[C.dateUnsub] || ''),
    lastIssue: String(row[C.lastIssue] || ''),
    lastSent:  String(row[C.lastSent]  || '')
  };
}

function saveContact(contact) {
  const sheet = openSS().getSheetByName('Contacts');
  const now   = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  const row   = [
    contact.prefix    || '',
    contact.firstName || '',
    contact.lastName  || '',
    contact.company   || '',
    contact.jobTitle  || '',
    contact.email     || '',
    contact.phone     || '',
    contact.zipcode   || '',
    contact.group     || '',
    contact.events    || '',
    contact.status    || '',
    contact.dateAdded || now,
    contact.dateUnsub || '',
    contact.lastIssue || '',
    contact.lastSent  || ''
  ];

  if (contact.rowIndex) {
    sheet.getRange(contact.rowIndex, 1, 1, 15).setValues([row]);
    return { success: true, rowIndex: contact.rowIndex };
  } else {
    sheet.appendRow(row);
    return { success: true, rowIndex: sheet.getLastRow() };
  }
}

function deleteContact(rowIndex) {
  openSS().getSheetByName('Contacts').deleteRow(rowIndex);
  return { success: true };
}

function getStats() {
  const ss      = openSS();
  const sheet   = ss.getSheetByName('Contacts');
  const data    = sheet.getDataRange().getValues();
  const cutoff  = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  const config     = getConfig(ss);
  const donorGroup = config['Donor Group Name'] || 'Donor';

  let total = 0, subscribed = 0, unsubscribed = 0, donors = 0;
  let subscribedNew = 0, donorsNew = 0;

  for (let i = 1; i < data.length; i++) {
    const row       = data[i];
    const email     = (row[C.email]     || '').toString().trim();
    const status    = (row[C.status]    || '').toString().trim().toLowerCase();
    const group     = (row[C.group]     || '').toString();
    const dateAdded = row[C.dateAdded];

    if (!email) continue;
    total++;

    if (status === 'subscribed')   subscribed++;
    if (status === 'unsubscribed') unsubscribed++;

    const groups = group.split(',').map(g => g.trim());
    if (groups.includes(donorGroup)) donors++;

    const added = dateAdded ? new Date(dateAdded) : null;
    if (added && added >= cutoff) {
      if (status === 'subscribed')     subscribedNew++;
      if (groups.includes(donorGroup)) donorsNew++;
    }
  }

  return { total, subscribed, unsubscribed, donors, subscribedNew, donorsNew };
}

function getEvents() {
  const sheet = openSS().getSheetByName('Contacts');
  const data  = sheet.getDataRange().getValues();
  const eventSet = {};

  for (let i = 1; i < data.length; i++) {
    const events = (data[i][C.events] || '').toString();
    if (!events.trim()) continue;
    events.split(',').forEach(e => {
      const code = e.trim();
      if (code) eventSet[code] = true;
    });
  }

  return Object.keys(eventSet).sort();
}
