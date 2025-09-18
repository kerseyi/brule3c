# brule3c
vibe coded steve brule interpretation of w3c

## Google Sheets guestbook backend (Apps Script)
1. Create a Google Sheet and add a tab named `guestbook` (or set a custom name later). The header row should be:
   `id | name | message | rule | stars | ts`.
2. Open **Extensions > Apps Script** and paste the contents of `integrations/google-apps-script/guestbook.gs` into the editor.
3. In the Apps Script editor, open **Project Settings > Script properties** and add:
   - `GUESTBOOK_SHEET_ID`: the sheet ID from the URL (`.../d/<ID>/...`).
   - (optional) `GUESTBOOK_SHEET_NAME`: if you used a different tab name.
   - (optional) `GUESTBOOK_ADMIN_TOKEN`: set this if you plan to call the `action=delete` or `action=import` admin endpoints.
4. Deploy the script via **Deploy > New deployment > Web app**. Choose *Execute as: Me* and *Who has access: Anyone* (or Anyone with the link), then grab the deployment URL.
5. Update `index.html` to replace `https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec` with your deployment URL. The script already keeps localhost pointing at `/api/guestbook` for local Node testing.
6. Push the static site (for example GitHub Pages). The front-end will call the Apps Script URL for GET/POST requests, while local development can still use the Node server.

### Front-end configuration
- The guestbook script reads `window.GUESTBOOK_API_URL` if it is set before `scripts.js` loads. The snippet near the bottom of `index.html` already sets this for production builds; update the placeholder URL with your Apps Script deployment ID.
- On localhost or `127.0.0.1`, the UI falls back to `/api/guestbook`, so you can keep using `node server.js` for local testing.
- Requests are sent as `text/plain` JSON to avoid CORS preflight; Apps Script automatically parses the payload in `doPost`.

### API behaviour
- `GET .../exec` returns `{ ok: true, entries: [...] }` with the entries sorted newest-first.
- `POST .../exec` with body `{ "name": "...", "message": "...", "rule": "...", "stars": 5 }` appends a row and returns `{ ok: true, entry: { ... } }`.
- Validation matches the Node version: name is required, message length 2-2000 characters, stars are clamped to 1-5.

### Admin helpers
- `POST https://script.google.com/.../exec?action=delete&token=YOUR_TOKEN` clears the sheet (requires `GUESTBOOK_ADMIN_TOKEN`).
- `POST https://script.google.com/.../exec?action=import&token=YOUR_TOKEN` with body `{ "entries": [...] }` overwrites the sheet.
- Leave `GUESTBOOK_ADMIN_TOKEN` blank if you do not need remote admin actions.
