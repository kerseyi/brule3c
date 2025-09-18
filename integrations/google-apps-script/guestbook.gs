const CONFIG_HEADER = ['id','name','message','rule','stars','ts'];

function getConfig() {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty('GUESTBOOK_SHEET_ID');
  if (!sheetId) {
    throw new Error('Set script property "GUESTBOOK_SHEET_ID" to the ID of your sheet.');
  }
  return {
    sheetId,
    sheetName: props.getProperty('GUESTBOOK_SHEET_NAME') || 'guestbook',
    adminToken: props.getProperty('GUESTBOOK_ADMIN_TOKEN') || ''
  };
}

function openGuestbookSheet() {
  const config = getConfig();
  const ss = SpreadsheetApp.openById(config.sheetId);
  const sheet = ss.getSheetByName(config.sheetName) || ss.insertSheet(config.sheetName);
  const range = sheet.getRange(1, 1, 1, CONFIG_HEADER.length);
  const values = range.getValues()[0];
  let needsHeader = false;
  for (let i = 0; i < CONFIG_HEADER.length; i++) {
    if ((values[i] || '').toString().trim().toLowerCase() !== CONFIG_HEADER[i]) {
      needsHeader = true;
      break;
    }
  }
  if (needsHeader) {
    range.setValues([CONFIG_HEADER]);
  }
  return { sheet, config };
}

function readEntries(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  const range = sheet.getRange(2, 1, lastRow - 1, CONFIG_HEADER.length);
  const rows = range.getValues();
  const entries = rows.map(row => ({
    id: String(row[0] || ''),
    name: String(row[1] || ''),
    message: String(row[2] || ''),
    rule: String(row[3] || ''),
    stars: Number(row[4]) || 5,
    ts: Number(row[5]) || Date.now()
  })).filter(entry => entry.id && entry.name && entry.message);
  entries.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  return entries;
}

function appendEntry(sheet, entry) {
  sheet.appendRow([
    entry.id,
    entry.name,
    entry.message,
    entry.rule,
    entry.stars,
    entry.ts
  ]);
}

function overwriteEntries(sheet, entries) {
  const startRow = sheet.getLastRow();
  if (startRow > 1) {
    sheet.deleteRows(2, startRow - 1);
  }
  if (!entries.length) {
    return;
  }
  const rows = entries.map(entry => [
    entry.id,
    entry.name,
    entry.message,
    entry.rule,
    entry.stars,
    entry.ts
  ]);
  sheet.getRange(2, 1, rows.length, CONFIG_HEADER.length).setValues(rows);
}

function normalizeStars(value) {
  const num = parseInt(value, 10);
  if (isNaN(num)) return 5;
  return Math.min(5, Math.max(1, num));
}

function sanitizeMessage(message) {
  return (message || '').replace(/\r\n?/g, '\n');
}

function createEntryFromPayload(payload) {
  const name = (payload.name || '').trim();
  const message = sanitizeMessage((payload.message || '').trim());
  const rule = (payload.rule || '').trim();
  const stars = normalizeStars(payload.stars);
  if (!name) {
    return { ok: false, error: 'Name is required.' };
  }
  if (message.length < 2) {
    return { ok: false, error: 'Message must be at least 2 characters.' };
  }
  if (message.length > 2000) {
    return { ok: false, error: 'Message must be 2000 characters or fewer.' };
  }
  const entry = {
    id: Utilities.getUuid(),
    name,
    message,
    rule,
    stars,
    ts: Date.now()
  };
  return { ok: true, entry };
}

function parseBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }
  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    return {};
  }
}

function jsonResponse(payload) {
  const output = ContentService.createTextOutput(JSON.stringify(payload));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function withError(message) {
  return jsonResponse({ ok: false, error: message || 'Unknown error.' });
}

function requireAdmin(e, config) {
  if (!config.adminToken) {
    return true;
  }
  const token = (e && e.parameter && e.parameter.token) || '';
  if (token !== config.adminToken) {
    throw new Error('Forbidden');
  }
  return true;
}

function doGet(e) {
  try {
    const { sheet } = openGuestbookSheet();
    const entries = readEntries(sheet);
    return jsonResponse({ ok: true, entries });
  } catch (err) {
    return withError(err.message);
  }
}

function doPost(e) {
  const action = (e && e.parameter && (e.parameter.action || '')).toLowerCase();
  try {
    const { sheet, config } = openGuestbookSheet();
    if (action === 'delete') {
      requireAdmin(e, config);
      overwriteEntries(sheet, []);
      return jsonResponse({ ok: true, entries: [] });
    }
    if (action === 'import') {
      requireAdmin(e, config);
      const payload = parseBody(e);
      const entries = Array.isArray(payload.entries) ? payload.entries.map(item => ({
        id: item && item.id ? String(item.id) : Utilities.getUuid(),
        name: (item && item.name ? String(item.name) : '').trim(),
        message: sanitizeMessage((item && item.message ? String(item.message) : '').trim()),
        rule: (item && item.rule ? String(item.rule) : '').trim(),
        stars: normalizeStars(item && item.stars),
        ts: Number(item && item.ts) || Date.now()
      })).filter(item => item.name && item.message.length >= 2 && item.message.length <= 2000) : [];
      overwriteEntries(sheet, entries);
      return jsonResponse({ ok: true, entries });
    }
    const payload = parseBody(e);
    const result = createEntryFromPayload(payload);
    if (!result.ok) {
      return withError(result.error);
    }
    appendEntry(sheet, result.entry);
    return jsonResponse({ ok: true, entry: result.entry });
  } catch (err) {
    return withError(err.message);
  }
}
