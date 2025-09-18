const http = require('http');
const fs = require('fs/promises');
const fssync = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'guestbook.json');
const ADMIN_TOKEN = process.env.GUESTBOOK_ADMIN_TOKEN || '';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

async function ensureDataFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(DATA_FILE);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(DATA_FILE, '[]', 'utf8');
    } else {
      throw err;
    }
  }
}

async function readEntries() {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.error('Failed to read entries:', err);
    }
    return [];
  }
}

async function writeEntries(entries) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2), 'utf8');
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

function sendText(res, statusCode, message) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(message);
}

function notFound(res) {
  sendText(res, 404, 'Not found');
}

function methodNotAllowed(res) {
  sendText(res, 405, 'Method not allowed');
}

function collectRequestBody(req, limit = 1_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function normalizeStars(value) {
  const num = Number.parseInt(value, 10);
  if (Number.isNaN(num)) return 5;
  return Math.min(5, Math.max(1, num));
}

function sanitizeLineBreaks(str) {
  return str.replace(/\r\n?/g, '\n');
}

function requireAdmin(req) {
  if (!ADMIN_TOKEN) return true;
  const auth = req.headers['authorization'];
  if (!auth) return false;
  const token = auth.replace(/^Bearer\s+/i, '');
  return token === ADMIN_TOKEN;
}

async function handleGetEntries(res) {
  const entries = await readEntries();
  sendJson(res, 200, { entries });
}

async function handleCreateEntry(req, res) {
  try {
    const raw = await collectRequestBody(req);
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      sendJson(res, 400, { error: 'Invalid JSON payload' });
      return;
    }

    const name = (payload.name || '').trim();
    const message = sanitizeLineBreaks((payload.message || '').trim());
    const rule = (payload.rule || '').trim();
    const stars = normalizeStars(payload.stars);

    if (!name) {
      sendJson(res, 400, { error: 'Name is required.' });
      return;
    }
    if (message.length < 2) {
      sendJson(res, 400, { error: 'Message must be at least 2 characters.' });
      return;
    }
    if (message.length > 2000) {
      sendJson(res, 400, { error: 'Message must be 2000 characters or fewer.' });
      return;
    }

    const now = Date.now();
    const entry = {
      id: crypto.randomUUID(),
      name,
      message,
      rule,
      stars,
      ts: now
    };

    const entries = await readEntries();
    entries.push(entry);
    await writeEntries(entries);

    sendJson(res, 201, { entry });
  } catch (err) {
    console.error('Failed to create entry:', err);
    sendJson(res, 500, { error: 'Failed to create entry.' });
  }
}

async function handleDeleteAll(req, res) {
  if (!requireAdmin(req)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    await writeEntries([]);
    sendJson(res, 200, { ok: true });
  } catch (err) {
    console.error('Failed to clear entries:', err);
    sendJson(res, 500, { error: 'Failed to clear entries.' });
  }
}

async function handleImportEntries(req, res) {
  if (!requireAdmin(req)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  try {
    const raw = await collectRequestBody(req);
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      sendJson(res, 400, { error: 'Invalid JSON payload' });
      return;
    }

    const { entries } = payload || {};
    if (!Array.isArray(entries)) {
      sendJson(res, 400, { error: 'Expected "entries" array.' });
      return;
    }

    const cleaned = entries.map(item => {
      const name = typeof item.name === 'string' ? item.name.trim() : '';
      const message = typeof item.message === 'string' ? sanitizeLineBreaks(item.message.trim()) : '';
      const rule = typeof item.rule === 'string' ? item.rule.trim() : '';
      const stars = normalizeStars(item.stars);
      const ts = Number.isFinite(item.ts) ? Number(item.ts) : Date.now();
      const id = typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID();
      return { id, name, message, rule, stars, ts };
    }).filter(item => item.name && item.message.length >= 2 && item.message.length <= 2000);

    await writeEntries(cleaned);
    sendJson(res, 200, { entries: cleaned });
  } catch (err) {
    console.error('Failed to import entries:', err);
    sendJson(res, 500, { error: 'Failed to import entries.' });
  }
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
}

async function handleApi(req, res, url) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (url.pathname === '/api/guestbook' && req.method === 'GET') {
    await handleGetEntries(res);
  } else if (url.pathname === '/api/guestbook' && req.method === 'POST') {
    await handleCreateEntry(req, res);
  } else if (url.pathname === '/api/guestbook' && req.method === 'DELETE') {
    await handleDeleteAll(req, res);
  } else if (url.pathname === '/api/guestbook/import' && req.method === 'POST') {
    await handleImportEntries(req, res);
  } else {
    notFound(res);
  }
}

async function serveStatic(req, res, url) {
  let filePath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname);
  while (filePath.startsWith('/')) { filePath = filePath.slice(1); }
  filePath = filePath.split('\\').join('/');
  const resolved = path.normalize(path.join(PUBLIC_DIR, filePath));

  if (!resolved.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      notFound(res);
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    res.statusCode = 200;
    res.setHeader('Content-Type', type);

    const stream = fssync.createReadStream(resolved);
    stream.on('error', err => {
      console.error('Stream error:', err);
      if (!res.headersSent) {
        res.statusCode = 500;
      }
      res.end();
    });
    stream.pipe(res);
  } catch (err) {
    if (err.code === 'ENOENT') {
      notFound(res);
    } else {
      console.error('Static file error:', err);
      sendText(res, 500, 'Internal server error');
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const origin = req.headers.host ? 'http://' + req.headers.host : 'http://localhost:' + PORT;
    const url = new URL(req.url, origin);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      await serveStatic(req, res, url);
    }
  } catch (err) {
    console.error('Request handling error:', err);
    if (!res.headersSent) {
      sendText(res, 500, 'Internal server error');
    } else {
      res.end();
    }
  }
});

ensureDataFile()
  .then(() => {
    server.listen(PORT, HOST, () => {
      console.log('Guestbook server listening on ' + HOST + ':' + PORT);
    });
  })
  .catch(err => {
    console.error('Failed to initialise data file:', err);
    process.exit(1);
  });

process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  server.close(() => process.exit(0));
});




