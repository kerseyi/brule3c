// Goofy & Calm modes
const goof = document.getElementById('goof');
const calm  = document.getElementById('calm');
const body  = document.body;
goof?.addEventListener('change', ()=> body.classList.toggle('goof', goof.checked));
calm?.addEventListener('change', ()=> body.classList.toggle('calm', calm.checked));

// Fake hit counter
window.addEventListener('load', () => {
  try{
    const key='counterHits';
    const n = (parseInt(localStorage.getItem(key)||'1',10)+Math.floor(Math.random()*3));
    localStorage.setItem(key, String(n));
    const el=document.getElementById('counter'); if(el){ el.textContent = String(n).padStart(6,'0'); }
  }catch(_){}
});

// ===== TOOT ENGINE (with intensity) =====
const fartStatus = document.getElementById('fartStatus');
const tootOnClick = document.getElementById('tootOnClick');
const tootOnDisclosure = document.getElementById('tootOnDisclosure');
const testPlay = document.getElementById('fartPlay');
const stopBtn  = document.getElementById('fartStop');
const vol = document.getElementById('tootVolume');
const intensity = document.getElementById('tootIntensity');
const intensityLabel = document.getElementById('intensityLabel');

const sfx = [
  document.getElementById('sfx1'),
  document.getElementById('sfx2'),
  document.getElementById('sfx3')
];

const say = (m)=> { if(fartStatus) fartStatus.textContent = m };

// volume
function setVol(v){ sfx.forEach(a => { try{ a.volume = v; }catch(_){} }); }
setVol(parseFloat(vol?.value || '0.6'));
vol?.addEventListener('input', ()=> setVol(parseFloat(vol.value)));

// intensity label
function updateIntensityLabel(){
  const val = parseInt(intensity.value, 10);
  intensityLabel.textContent = val === 1 ? 'Intensity: Mild 🫘' : (val === 2 ? 'Intensity: Medium 🌶️' : 'Intensity: Chili Night 🔥🌶️🌶️');
}
updateIntensityLabel();
intensity?.addEventListener('input', updateIntensityLabel);

// random toot with debounce + intensity behavior
let lastToot = 0;
function playOneToot(){
  const a = sfx[Math.floor(Math.random()*sfx.length)];
  try { a.currentTime = 0; a.play(); } catch(e){}
}
function playRandomToot(){
  const now = Date.now();
  if(now - lastToot < 200) return; // debounce
  lastToot = now;

  const lvl = parseInt(intensity.value || '2', 10);
  const baseVol = parseFloat(vol.value || '0.6');
  setVol(Math.min(1, baseVol * (lvl === 1 ? 0.8 : lvl === 2 ? 1.0 : 1.15)));

  if(lvl === 1){
    playOneToot(); say('💨 pfft (mild)');
  }else if(lvl === 2){
    playOneToot(); if(Math.random() < 0.25){ setTimeout(playOneToot, 140); } say('💨 toot!');
  }else{
    playOneToot(); setTimeout(playOneToot, 130 + Math.random()*120);
    if(Math.random() < 0.6){ setTimeout(playOneToot, 260 + Math.random()*150); }
    say('🔥🌶️ TOOT STORM!');
  }
}

// Click-to-toot (links & buttons)
document.addEventListener('click', (e)=>{
  if(!tootOnClick?.checked) return;
  const t = e.target;
  const isLink   = t.closest && t.closest('a');
  const isButton = t.closest && t.closest('button');
  if(isLink || isButton){ playRandomToot(); }
}, true);

// Disclosure-to-toot — fires on open AND close
function wireDisclosures(){
  document.querySelectorAll('details').forEach(d=>{
    d.addEventListener('toggle', ()=>{
      if(tootOnDisclosure?.checked){ playRandomToot(); }
    });
  });
}
wireDisclosures();

testPlay?.addEventListener('click', (e)=> { e.preventDefault(); playRandomToot(); });
stopBtn?.addEventListener('click', (e)=> {
  e.preventDefault();
  sfx.forEach(a=>{ try{ a.pause(); a.currentTime=0; }catch(_){} });
  say('⛔ toot stopped');
});

document.addEventListener('visibilitychange', ()=> {
  if(document.hidden){ sfx.forEach(a=>{ try{ a.pause(); }catch(_){} }); }
});

// ===== GUESTBOOK =====
const API_URL = (() => {
  if (typeof window !== 'undefined' && window.GUESTBOOK_API_URL) {
    return window.GUESTBOOK_API_URL;
  }
  if (typeof window !== 'undefined' && ['localhost','127.0.0.1'].includes(window.location.hostname)) {
    return '/api/guestbook';
  }
  return 'https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec';
})();
const gbList = document.getElementById('gb-list');
const gbStatus = document.getElementById('gb-status');
const gbName = document.getElementById('gb-name');
const gbMsg = document.getElementById('gb-msg');
const gbRule = document.getElementById('gb-rule');
const gbStars = document.getElementById('gb-stars');
const gbToots = document.getElementById('gb-toots');
const gbSubmit = document.getElementById('gb-submit');
const gbRefresh = document.getElementById('gb-refresh');

const gbState = {
  entries: [],
  loading: false
};

function escapeHTML(str = '') {
  return str.replace(/[&<>"']/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[ch]);
}

function starString(value) {
  const n = Math.max(1, Math.min(5, parseInt(value || '5', 10)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function setStatus(message, tone = 'info') {
  if (!gbStatus) return;
  gbStatus.textContent = message;
  gbStatus.classList.remove('is-info', 'is-success', 'is-error', 'is-progress');
  let className = 'is-info';
  if (tone === 'success') className = 'is-success';
  else if (tone === 'error') className = 'is-error';
  else if (tone === 'progress') className = 'is-progress';
  gbStatus.classList.add(className);
}

function renderEmpty(message) {
  if (!gbList) return;
  gbList.setAttribute('aria-busy', 'false');
  gbList.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'gb-card muter';
  div.textContent = message;
  gbList.appendChild(div);
}

function renderLoading(message) {
  if (!gbList) return;
  gbList.setAttribute('aria-busy', 'true');
  gbList.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'gb-loading';
  div.textContent = message || 'Loading bean scribbles...';
  gbList.appendChild(div);
}

function renderEntries(entries = gbState.entries) {
  if (!gbList) return;
  const sorted = entries.slice().sort((a, b) => ((b && b.ts) || 0) - ((a && a.ts) || 0));
  if (!sorted.length) {
    renderEmpty('No entries yet. Be the first bean hero!');
    return;
  }

  gbList.innerHTML = '';
  for (const entry of sorted) {
    const ratingSource = entry && entry.stars != null ? entry.stars : '5';
    const rating = Math.max(1, Math.min(5, parseInt(ratingSource, 10)));
    const card = document.createElement('article');
    card.className = 'gb-card';
    const meta = document.createElement('div');
    meta.className = 'gb-meta';
    const date = new Date(entry && entry.ts ? entry.ts : Date.now());
    meta.innerHTML = `<span><strong>${escapeHTML(entry && entry.name ? entry.name : 'Anonymous Bean')}</strong></span>
                        <span class="stars" aria-label="${rating} out of 5 stars">${starString(rating)}</span>
                        <span>•</span>
                        <span>${date.toLocaleString()}</span>
                        ${entry && entry.rule ? `<span>Fav: ${escapeHTML(entry.rule)}</span>` : ''}`;
    const msg = document.createElement('p');
    msg.innerHTML = escapeHTML(entry && entry.message ? entry.message : '').replace(/\n/g, '<br>');
    card.appendChild(meta);
    card.appendChild(msg);
    gbList.appendChild(card);
  }
  gbList.setAttribute('aria-busy', 'false');
}

function rateLimitOK() {
  try {
    const last = parseInt(sessionStorage.getItem('gb-last') || '0', 10);
    const now = Date.now();
    if (now - last < 5000) return false;
    sessionStorage.setItem('gb-last', String(now));
    return true;
  } catch (_) {
    return true;
  }
}

async function fetchEntries(options = {}) {
  const { initial = false, silent = false } = options;
  if (gbState.loading) return;
  gbState.loading = true;
  if (gbRefresh) gbRefresh.disabled = true;

  if (initial || (!gbState.entries.length && !silent)) {
    renderLoading('Loading bean scribbles...');
  } else if (!silent && gbList) {
    gbList.setAttribute('aria-busy', 'true');
  }

  if (initial) {
    setStatus('Loading bean scribbles from the ether...', 'progress');
  } else if (!silent) {
    setStatus('Refreshing guestbook...', 'progress');
  }

  try {
    const response = await fetch(API_URL, { headers: { 'Accept': 'application/json' } });
    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    const failed = (!response.ok) || (data && data.ok === false);
    if (failed) {
      const message = data && data.error ? data.error : `Server responded with ${response.status}`;
      throw new Error(message);
    }

    const entries = Array.isArray(data && data.entries) ? data.entries : [];
    gbState.entries = entries;
    renderEntries(entries);
    if (!silent) {
      if (entries.length) {
        setStatus(`Loaded ${entries.length} bean scribbles.`, 'success');
      } else {
        setStatus('No entries yet. Be the first bean hero!', 'info');
      }
    }
  } catch (err) {
    console.error('Guestbook load failed', err);
    if (!gbState.entries.length) {
      renderEmpty('Could not load entries. Beans might be stuck in the pneumatic tube.');
    }
    if (!silent) {
      const extra = err && err.message ? ` ${err.message}` : ' Beans might be stuck in the pneumatic tube.';
      setStatus(`Failed to load entries.${extra}`, 'error');
    }
  } finally {
    gbState.loading = false;
    if (gbRefresh) gbRefresh.disabled = false;
  }
}

function upsertEntry(entry) {
  if (!entry) return;
  const idx = gbState.entries.findIndex(item => item && item.id === entry.id);
  if (idx >= 0) {
    gbState.entries[idx] = entry;
  } else {
    gbState.entries.push(entry);
  }
}

gbSubmit?.addEventListener('click', async () => {
  const name = (gbName?.value || '').trim();
  const message = (gbMsg?.value || '').trim();
  const rule = (gbRule?.value || '').trim();
  const stars = parseInt(gbStars?.value || '5', 10);

  if (!name) {
    setStatus('Name is required, my dude.', 'error');
    gbName?.focus();
    return;
  }
  if (message.length < 2) {
    setStatus('Write a lil\' message, even a "hi beans."', 'error');
    gbMsg?.focus();
    return;
  }
  if (message.length > 2000) {
    setStatus('Whoa novelist - keep it under 2000 chars.', 'error');
    gbMsg?.focus();
    return;
  }
  if (!rateLimitOK()) {
    setStatus('Cool your jets - try again in a few seconds.', 'error');
    return;
  }

  setStatus('Saving your bean wisdom...', 'progress');
  if (gbSubmit) {
    gbSubmit.disabled = true;
    gbSubmit.setAttribute('aria-disabled', 'true');
  }

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=UTF-8',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ name, message, rule, stars })
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_) {
      data = null;
    }

    const failed = (!response.ok) || (data && data.ok === false);
    if (failed) {
      const msg = data && data.error ? data.error : 'Failed to sign the guestbook.';
      setStatus(msg, 'error');
      return;
    }

    const entry = data && data.entry ? data.entry : null;
    if (entry) {
      upsertEntry(entry);
      renderEntries();
    } else {
      await fetchEntries({ silent: true });
    }
    setStatus('Signed! Your wisdom is etched into the bean-scrolls.', 'success');
    if (gbMsg) gbMsg.value = '';
    if (gbToots?.checked) {
      playRandomToot();
    }
  } catch (err) {
    console.error('Guestbook submit failed', err);
    setStatus('Failed to sign the guestbook. The intertubes are clogged.', 'error');
  } finally {
    if (gbSubmit) {
      gbSubmit.disabled = false;
      gbSubmit.removeAttribute('aria-disabled');
    }
  }
});

gbRefresh?.addEventListener('click', () => {
  fetchEntries({ silent: false });
});

const backToTop = document.getElementById('back-to-top');
backToTop?.addEventListener('click', event => {
  event.preventDefault();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Kick off initial load
fetchEntries({ initial: true });
