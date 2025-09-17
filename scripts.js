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

// ===== GUESTBOOK (localStorage) =====
const GB_KEY = 'geocitiesGuestbookV1';
const gbList = document.getElementById('gb-list');
const gbStatus = document.getElementById('gb-status');
const gbName = document.getElementById('gb-name');
const gbMsg = document.getElementById('gb-msg');
const gbRule = document.getElementById('gb-rule');
const gbStars = document.getElementById('gb-stars');
const gbToots = document.getElementById('gb-toots');
const gbSubmit = document.getElementById('gb-submit');
const gbClear = document.getElementById('gb-clear');
const gbExport = document.getElementById('gb-export');
const gbImportInput = document.getElementById('gb-import-input');

function escapeHTML(str=''){
  return str.replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[s]));
}

function loadEntries(){
  try{
    const raw = localStorage.getItem(GB_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(_){ return []; }
}
function saveEntries(entries){
  try{ localStorage.setItem(GB_KEY, JSON.stringify(entries)); }catch(_){}
}

function starString(n){
  n = Math.max(1, Math.min(5, parseInt(n||'5',10)));
  return '★'.repeat(n) + '☆'.repeat(5-n);
}

function renderEntries(){
  const entries = loadEntries().slice().reverse(); // newest first
  gbList.setAttribute('aria-busy','true');
  gbList.innerHTML = '';
  if(entries.length === 0){
    const div = document.createElement('div');
    div.className = 'gb-card muter';
    div.textContent = 'No entries yet. Be the first bean hero!';
    gbList.appendChild(div);
  }else{
    for(const e of entries){
      const card = document.createElement('article');
      card.className = 'gb-card';
      const meta = document.createElement('div');
      meta.className = 'gb-meta';
      const date = new Date(e.ts || Date.now());
      meta.innerHTML = `<span><strong>${escapeHTML(e.name)}</strong></span>
                        <span class="stars" aria-label="${e.stars} out of 5 stars">${starString(e.stars)}</span>
                        <span>•</span>
                        <span>${date.toLocaleString()}</span>
                        ${e.rule ? `<span>• Fav: ${escapeHTML(e.rule)}</span>` : ''}`;
      const msg = document.createElement('p');
      msg.innerHTML = escapeHTML(e.message || '').replace(/\n/g,'<br>');
      card.appendChild(meta);
      card.appendChild(msg);
      gbList.appendChild(card);
    }
  }
  gbList.removeAttribute('aria-busy');
}

function rateLimitOK(){
  try{
    const last = parseInt(sessionStorage.getItem('gb-last')||'0',10);
    const now = Date.now();
    if(now - last < 5000){ return false; } // 5s
    sessionStorage.setItem('gb-last', String(now));
    return true;
  }catch(_){ return true; }
}

gbSubmit?.addEventListener('click', ()=>{
  const name = (gbName.value||'').trim();
  const message = (gbMsg.value||'').trim();
  const rule = gbRule.value;
  const stars = gbStars.value;

  if(!name){ gbStatus.textContent = 'Name is required, my dude.'; gbName.focus(); return; }
  if(message.length < 2){ gbStatus.textContent = 'Write a lil’ message, even a “hi beans.”'; gbMsg.focus(); return; }
  if(message.length > 2000){ gbStatus.textContent = 'Whoa novelist — keep it under 2000 chars.'; gbMsg.focus(); return; }
  if(!rateLimitOK()){ gbStatus.textContent = 'Cool your jets — try again in a few seconds.'; return; }

  const entries = loadEntries();
  const entry = { name, message, rule, stars, ts: Date.now() };
  entries.push(entry);
  saveEntries(entries);
  renderEntries();
  gbStatus.textContent = 'Signed! Your wisdom is etched into the bean-scrolls.';
  gbMsg.value = '';
  if(gbToots.checked){ playRandomToot(); }
});

gbClear?.addEventListener('click', ()=>{
  if(confirm('Clear ALL guestbook entries on this device? This can’t be undone.')){
    saveEntries([]); renderEntries(); gbStatus.textContent = 'Guestbook cleared (local only).';
  }
});

gbExport?.addEventListener('click', ()=>{
  const data = JSON.stringify(loadEntries(), null, 2);
  const blob = new Blob([data], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'guestbook.json';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  gbStatus.textContent = 'Exported guestbook as JSON.';
});

gbImportInput?.addEventListener('change', async (e)=>{
  const file = e.target.files && e.target.files[0];
  if(!file) return;
  try{
    const text = await file.text();
    const data = JSON.parse(text);
    if(!Array.isArray(data)) throw new Error('Bad format');
    saveEntries(data); renderEntries(); gbStatus.textContent = 'Imported entries. Welcome back, beanlord.';
  }catch(err){
    gbStatus.textContent = 'Import failed. JSON might be funky.';
  }finally{
    e.target.value = '';
  }
});

const backToTop = document.getElementById('back-to-top');
backToTop?.addEventListener('click', (event)=>{
  event.preventDefault();
  window.scrollTo({top:0, behavior:'smooth'});
});

// initial render
renderEntries();
