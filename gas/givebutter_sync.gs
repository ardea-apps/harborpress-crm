// ============================================================
// Donor Sync — Givebutter implementation
// ============================================================
// This file is the Givebutter-specific implementation of donor
// sync. To integrate a different donor platform (Stripe, Classy,
// Bloomerang, etc.), swap out fetchDonations() and the API
// URL/auth below — the Config keys, Contacts writing, dedup, and
// logging all stay the same regardless of platform.
//
// Runs daily via time-driven trigger.
// Fetches completed donations from Givebutter since last sync,
// adds new donors to Contacts tab or updates existing contacts
// with the configured Donor Group.
//
// SETUP (Config tab, col A/B):
//   Donor API Key        → your Givebutter API key.
//                           Leave BLANK to turn donor sync off —
//                           this is the intended way to disable
//                           it, not an error condition.
//   Donor Group Name     → e.g. "Donor" — group new/matched
//                           donors get tagged with.
//   Last Donor Sync → leave blank (auto-filled after each run).
//
// TRIGGER SETUP:
//   Apps Script → Triggers (clock icon) → Add Trigger
//   Function:    syncDonors
//   Event source: Time-driven
//   Type:        Day timer
//   Time:        11pm to midnight (or any overnight window)
//   (Or use CRM → Create Daily Sync Trigger from the menu.)
//
//   Run syncDonors() manually once to do the initial sync.
//   Set Last Donor Sync to a past date first if you want
//   to backfill historical donors (e.g. 2024-01-01T00:00:00Z).
//
// LOG TAB:
//   A "Sync Log" tab is created automatically on first run.
// ============================================================

const GB_API_URL = 'https://api.givebutter.com/v1';

// ============================================================
// MAIN SYNC FUNCTION
// ============================================================
function syncDonors() {
  const ss     = SpreadsheetApp.getActiveSpreadsheet();
  const config = getConfig(ss);
  const apiKey = config['Donor API Key'];

  if (!apiKey) {
    logSync(ss, 'Donor sync is off (no Donor API Key set in Config). Skipping — this is expected if you don\'t use donor sync.', 0, 0, 0, 0);
    return;
  }

  const donorGroup = config['Donor Group Name'] || 'Donor';

  let lastSync = config['Last Donor Sync'];
  if (!lastSync) {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    lastSync = d.toISOString();
  }

  Logger.log('Donor sync started. Last sync: ' + lastSync);

  const donations = fetchDonations(apiKey, lastSync);
  Logger.log('Donations fetched: ' + donations.length);

  if (donations.length === 0) {
    const now = new Date().toISOString();
    updateLastSync(ss, now);
    logSync(ss, 'No new donations since last sync.', 0, 0, 0, 0);
    return;
  }

  const contactSheet = ss.getSheetByName('Contacts');
  const data         = contactSheet.getDataRange().getValues();

  const emailMap = {};
  for (let i = 1; i < data.length; i++) {
    const email = (data[i][C.email] || '').toString().trim().toLowerCase();
    if (email) emailMap[email] = i;
  }

  let newAdded = 0, existingUpdated = 0, errors = 0;
  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

  for (const donation of donations) {
    try {
      const email     = (donation.email || '').trim().toLowerCase();
      const firstName = (donation.first_name || '').trim();
      const lastName  = (donation.last_name  || '').trim();
      const phone     = (donation.phone      || '').trim();
      const zip       = (donation.zip_code   || '').trim();

      if (!email) continue;

      if (email in emailMap) {
        const rowIdx   = emailMap[email];
        const sheetRow = rowIdx + 1;
        const groups   = (data[rowIdx][C.group] || '').toString()
          .split(',').map(g => g.trim()).filter(Boolean);

        if (!groups.includes(donorGroup)) {
          groups.push(donorGroup);
          contactSheet.getRange(sheetRow, C.group + 1).setValue(groups.join(', '));
          contactSheet.getRange(sheetRow, C.lastSent + 1).setValue(now);
          Logger.log('Updated existing contact: ' + email + ' → added ' + donorGroup);
          existingUpdated++;
        } else {
          Logger.log('Already ' + donorGroup + ', skipped: ' + email);
        }

      } else {
        const newRow = [
          '',           // A Prefix
          firstName,    // B First Name
          lastName,     // C Last Name
          '',           // D Company
          '',           // E Job Title
          email,        // F Email
          phone,        // G Phone
          zip,          // H Zip Code
          donorGroup,   // I Group
          '',           // J Events
          '',           // K Status (blank — not a newsletter subscriber yet)
          now,          // L Date Added
          '',           // M Date Unsubscribed
          '',           // N Last Issue
          ''            // O Last Sent
        ];
        contactSheet.appendRow(newRow);
        emailMap[email] = data.length + newAdded;
        Logger.log('New donor added: ' + email);
        newAdded++;
      }

    } catch (err) {
      Logger.log('Error processing donation: ' + err.message);
      errors++;
    }
  }

  updateLastSync(ss, new Date().toISOString());

  const summary = 'Sync complete. Checked: ' + donations.length +
    ' | New: ' + newAdded +
    ' | Updated: ' + existingUpdated +
    ' | Errors: ' + errors;
  Logger.log(summary);
  logSync(ss, summary, donations.length, newAdded, existingUpdated, errors);
}

// ============================================================
// GIVEBUTTER API — fetch donations since a given timestamp
// ============================================================
function fetchDonations(apiKey, since) {
  const donations = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const url = GB_API_URL + '/transactions'
      + '?status=succeeded'
      + '&type=donation'
      + '&created_after=' + encodeURIComponent(since)
      + '&per_page=100'
      + '&page=' + page;

    const response = UrlFetchApp.fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'application/json'
      },
      muteHttpExceptions: true
    });

    const code = response.getResponseCode();
    if (code !== 200) {
      Logger.log('Givebutter API error: ' + code + ' — ' + response.getContentText());
      break;
    }

    const json = JSON.parse(response.getContentText());
    const items = json.data || [];

    for (const item of items) {
      donations.push({
        email:      item.email      || (item.member && item.member.email)      || '',
        first_name: item.first_name || (item.member && item.member.first_name) || '',
        last_name:  item.last_name  || (item.member && item.member.last_name)  || '',
        phone:      item.phone      || (item.member && item.member.phone)      || '',
        zip_code:   item.zip_code   || ''
      });
    }

    const meta = json.meta || {};
    hasMore = meta.current_page < meta.last_page;
    page++;

    if (items.length === 0) hasMore = false;
    Utilities.sleep(300); // rate limit courtesy
  }

  // Deduplicate by email — one entry per donor
  const seen = {};
  return donations.filter(d => {
    const key = d.email.toLowerCase();
    if (!key || seen[key]) return false;
    seen[key] = true;
    return true;
  });
}

function updateLastSync(ss, timestamp) {
  const sheet = ss.getSheetByName('Config');
  const data  = sheet.getDataRange().getValues();
  for (let i = 0; i < data.length; i++) {
    if ((data[i][0] || '').toString().trim() === 'Last Donor Sync') {
      sheet.getRange(i + 1, 2).setValue(timestamp);
      return;
    }
  }
}

// ============================================================
// SYNC LOG
// ============================================================
function logSync(ss, message, checked, newAdded, updated, errors) {
  let logSheet = ss.getSheetByName('Sync Log');
  if (!logSheet) {
    logSheet = ss.insertSheet('Sync Log');
    logSheet.getRange(1, 1, 1, 6).setValues([[
      'Timestamp', 'Donations Checked', 'New Donors Added',
      'Existing Updated', 'Errors', 'Message'
    ]]);
    logSheet.getRange(1, 1, 1, 6).setFontWeight('bold')
      .setBackground('#0a2d6e').setFontColor('#ffffff');
  }

  const now = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  logSheet.appendRow([now, checked, newAdded, updated, errors, message]);
}

// ============================================================
// SETUP TRIGGER — run once manually to install the daily trigger
// ============================================================
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    if (trigger.getHandlerFunction() === 'syncDonors') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('syncDonors')
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .create();

  Logger.log('Daily trigger created for syncDonors at 11pm.');
  SpreadsheetApp.getUi().alert('Daily sync trigger created. syncDonors will run every night at 11pm.');
}

// ============================================================
// Duplicate Contact Review (two-step) — platform-agnostic,
// unrelated to donor sync, kept in this file per current layout.
// ============================================================
// Step 1: CRM → Find Duplicates
//   Scans Contacts tab for duplicate emails.
//   Creates a "Duplicates Review" tab showing each duplicate
//   set with KEEP/DELETE suggestions.
//   You can edit column A (KEEP/DELETE) before proceeding.
//
// Step 2: CRM → Confirm Delete Duplicates
//   Reads your decisions from the Duplicates Review tab
//   and deletes all rows marked DELETE.
//   Removes the Duplicates Review tab when done.
// ============================================================

function findDuplicates() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Contacts');
  const data  = sheet.getDataRange().getValues();
  const ui    = SpreadsheetApp.getUi();

  const emailMap = {};
  for (let i = 1; i < data.length; i++) {
    const row   = data[i];
    const email = (row[C.email] || '').toString().trim().toLowerCase();
    if (!email) continue;
    const score = row.filter(cell => (cell || '').toString().trim() !== '').length;
    if (!emailMap[email]) emailMap[email] = [];
    emailMap[email].push({ rowIndex: i + 1, row, score });
  }

  const dupSets = Object.values(emailMap).filter(entries => entries.length > 1);

  if (dupSets.length === 0) {
    ui.alert('No Duplicates Found', 'All email addresses in the Contacts tab are unique.', ui.ButtonSet.OK);
    return;
  }

  const existing = ss.getSheetByName('Duplicates Review');
  if (existing) ss.deleteSheet(existing);

  const reviewSheet = ss.insertSheet('Duplicates Review');

  const headers = [
    'Action', 'Email', 'Contact Row', 'First Name', 'Last Name',
    'Company', 'Group', 'Events', 'Status', 'Date Added', 'Score'
  ];
  reviewSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  reviewSheet.getRange(1, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#0a2d6e')
    .setFontColor('#ffffff');

  const rows = [];
  for (const entries of dupSets) {
    entries.sort((a, b) => b.score - a.score);
    for (let i = 0; i < entries.length; i++) {
      const e   = entries[i];
      const row = e.row;
      rows.push([
        i === 0 ? 'KEEP' : 'DELETE',
        (row[C.email]     || '').toString().trim(),
        e.rowIndex,
        (row[C.firstName] || '').toString().trim(),
        (row[C.lastName]  || '').toString().trim(),
        (row[C.company]   || '').toString().trim(),
        (row[C.group]     || '').toString().trim(),
        (row[C.events]    || '').toString().trim(),
        (row[C.status]    || '').toString().trim(),
        (row[C.dateAdded] || '').toString().trim(),
        e.score
      ]);
    }
    rows.push(['', '', '', '', '', '', '', '', '', '', '']);
  }

  reviewSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  for (let i = 0; i < rows.length; i++) {
    const action = rows[i][0];
    const range  = reviewSheet.getRange(i + 2, 1, 1, headers.length);
    if (action === 'KEEP')   range.setBackground('#d4edda');
    if (action === 'DELETE') range.setBackground('#f8d7da');
  }

  const actionRange = reviewSheet.getRange(2, 1, rows.length, 1);
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['KEEP', 'DELETE'], true)
    .build();
  actionRange.setDataValidation(rule);

  reviewSheet.autoResizeColumns(1, headers.length);

  const totalDups = dupSets.reduce((sum, entries) => sum + entries.length - 1, 0);

  ui.alert(
    'Duplicates Found',
    totalDups + ' duplicate row' + (totalDups !== 1 ? 's' : '') + ' found across ' + dupSets.length + ' email' + (dupSets.length !== 1 ? 's' : '') + '.\n\n' +
    'Review the "Duplicates Review" tab.\n' +
    'Change KEEP/DELETE in column A as needed.\n\n' +
    'Then run CRM → Confirm Delete Duplicates.',
    ui.ButtonSet.OK
  );
}

function confirmDeleteDuplicates() {
  const ss          = SpreadsheetApp.getActiveSpreadsheet();
  const reviewSheet = ss.getSheetByName('Duplicates Review');
  const ui          = SpreadsheetApp.getUi();

  if (!reviewSheet) {
    ui.alert('No Duplicates Review tab found.\nRun CRM → Find Duplicates first.');
    return;
  }

  const data = reviewSheet.getDataRange().getValues();
  const toDelete = [];

  for (let i = 1; i < data.length; i++) {
    const action   = (data[i][0] || '').toString().trim().toUpperCase();
    const rowIndex = parseInt(data[i][2]);
    if (action === 'DELETE' && rowIndex > 1) {
      toDelete.push(rowIndex);
    }
  }

  if (toDelete.length === 0) {
    ui.alert('No rows marked DELETE. Nothing to remove.');
    return;
  }

  const confirm = ui.alert(
    'Confirm Deletion',
    'This will permanently delete ' + toDelete.length + ' row' + (toDelete.length !== 1 ? 's' : '') + ' from the Contacts tab.\n\nThis cannot be undone. Proceed?',
    ui.ButtonSet.OK_CANCEL
  );
  if (confirm !== ui.Button.OK) return;

  const contactSheet = ss.getSheetByName('Contacts');
  toDelete.sort((a, b) => b - a);
  for (const rowIndex of toDelete) {
    contactSheet.deleteRow(rowIndex);
    Logger.log('Deleted row: ' + rowIndex);
  }

  ss.deleteSheet(reviewSheet);

  ui.alert('Done', toDelete.length + ' row' + (toDelete.length !== 1 ? 's' : '') + ' deleted. Duplicates Review tab removed.', ui.ButtonSet.OK);
}
