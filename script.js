/* =====================================================
   ULTRARCHIVE — script.js
   All logic for archive submission, search, and history.
   ===================================================== */

/* ============ SERVICE REGISTRY ============
   Add new archive services here. Each needs:
   - id, icon, name, type, desc
   - url(u)         → the submission endpoint
   - archiveUrl(u)  → where to find/view the archive
   - login          → whether it requires an account
*/
const SERVICES = [
  { id:'wayback',      icon:'🕰', name:'Wayback Machine',     type:'Public Snapshot',  desc:"The internet's library. 800B+ pages.",
    url: u => `https://web.archive.org/save/${u}`,
    archiveUrl: u => `https://web.archive.org/web/*/${u}`,
    login: false },

  { id:'archivetoday', icon:'📸', name:'Archive.today',       type:'Full Snapshot',    desc:'HTML + screenshot. Bypasses robots.txt.',
    url: u => `https://archive.ph/?run=1&url=${encodeURIComponent(u)}`,
    archiveUrl: u => `https://archive.ph/${encodeURIComponent(u)}`,
    login: false },

  { id:'ghostarchive', icon:'👻', name:'Ghost Archive',       type:'Dynamic + Video',  desc:'JS-heavy sites & YouTube archiving.',
    url: u => `https://ghostarchive.org/archive?term=${encodeURIComponent(u)}`,
    archiveUrl: u => `https://ghostarchive.org/search?term=${encodeURIComponent(u)}`,
    login: false },

  { id:'megalodon',    icon:'🐋', name:'Megalodon (JP)',       type:'JP National',      desc:'Japanese archiver. Great Asian coverage.',
    url: u => `https://megalodon.jp/?url=${encodeURIComponent(u)}`,
    archiveUrl: u => `https://megalodon.jp/`,
    login: false },

  { id:'arquivo',      icon:'🇵🇹', name:'Arquivo.pt',          type:'EU National',      desc:"Portugal's national web archive.",
    url: u => `https://arquivo.pt/save/${encodeURIComponent(u)}`,
    archiveUrl: u => `https://arquivo.pt/noFrame/replay/*/${u}`,
    login: false },

  { id:'freezepage',   icon:'🧊', name:'FreezeFrame',         type:'Quick Snapshot',   desc:'Instant frozen copy with shareable link.',
    url: u => `https://www.freezepage.com/${encodeURIComponent(u)}`,
    archiveUrl: u => `https://www.freezepage.com/`,
    login: false },

  { id:'webcite',      icon:'📚', name:'WebCite',             type:'Academic Archive', desc:'Citation-safe. Prevents link rot.',
    url: u => `https://www.webcitation.org/archive?url=${encodeURIComponent(u)}&email=archive@ultrarchive.io`,
    archiveUrl: u => `https://www.webcitation.org/`,
    login: false },

  { id:'memento',      icon:'⏱', name:'Memento Time Travel', type:'Archive Search',   desc:'Searches 30+ archives for your URL.',
    url: u => `https://timetravel.mementoweb.org/timemap/link/${u}`,
    archiveUrl: u => `https://timetravel.mementoweb.org/timemap/link/${u}`,
    login: false },

  { id:'permacc',      icon:'🔗', name:'Perma.cc',            type:'Permanent Link',   desc:'Harvard Law-backed. Legal-grade citations.',
    url: u => `https://perma.cc/`,
    archiveUrl: u => `https://perma.cc/`,
    login: true },

  { id:'archiveit',    icon:'🏛', name:'Archive-It',          type:'Institutional',    desc:"Internet Archive's pro crawl service.",
    url: u => `https://archive-it.org/`,
    archiveUrl: u => `https://archive-it.org/`,
    login: true },

  { id:'ukweb',        icon:'🇬🇧', name:'UK Web Archive',      type:'UK National',      desc:'British Library. Best for .uk domains.',
    url: u => `https://www.webarchive.org.uk/en/ukwa/`,
    archiveUrl: u => `https://www.webarchive.org.uk/en/ukwa/`,
    login: true },

  { id:'preservetube', icon:'📹', name:'PreserveTube',        type:'Video Archive',    desc:'Save YouTube videos before they vanish.',
    url: u => `https://preservetube.com/`,
    archiveUrl: u => `https://preservetube.com/`,
    login: false },
];

/* ============ STATE ============ */
let states = {};            // id -> 'wait' | 'ok' | 'err' | 'login'
let running = false;
const HISTORY_KEY = 'ultrarchive_history';

/* ============ HELPERS ============ */
function normUrl(u) {
  return (u || '').trim().replace(/\/+$/, '').toLowerCase();
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function $(id) { return document.getElementById(id); }

/* ============ LOCAL HISTORY (persisted in browser) ============ */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function saveHistory(list) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

function addToHistory(url, successfulServiceIds) {
  let history = getHistory();
  const norm = normUrl(url);
  const existing = history.find(h => normUrl(h.url) === norm);
  if (existing) {
    existing.archived = [...new Set([...(existing.archived || []), ...successfulServiceIds])];
    existing.lastUpdated = Date.now();
    // bump to top
    history = [existing, ...history.filter(h => h !== existing)];
  } else {
    history.unshift({
      url,
      archived: successfulServiceIds,
      firstArchived: Date.now(),
      lastUpdated: Date.now(),
    });
  }
  history = history.slice(0, 200); // keep last 200
  saveHistory(history);
}

/* ============ TAB SWITCHING ============ */
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b === btn));
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `tab-${tab}`);
    });
    if (tab === 'search') renderHistory();
  });
});

/* ============ ARCHIVE FLOW ============ */
function countStats() {
  const ok = Object.values(states).filter(s => s === 'ok').length;
  const pend = Object.values(states).filter(s => s === 'wait').length;
  const login = SERVICES.filter(s => s.login).length;
  $('sTotal').textContent = SERVICES.length;
  $('sOk').textContent = ok;
  $('sPend').textContent = pend;
  $('sLogin').textContent = login;
  const nonLogin = SERVICES.filter(s => !s.login).length;
  const pct = nonLogin > 0 ? Math.round((ok / nonLogin) * 100) : 0;
  $('progressFill').style.width = pct + '%';
}

function pill(svc) {
  const s = states[svc.id];
  if (svc.login)      return `<span class="pill pill-login">LOGIN REQ</span>`;
  if (s === 'ok')     return `<span class="pill pill-ok">✓ SAVED</span>`;
  if (s === 'wait')   return `<span class="pill pill-wait">SUBMITTING</span><div class="spin"></div>`;
  if (s === 'err')    return `<span class="pill pill-err">ERROR</span>`;
  return                     `<span class="pill pill-idle">READY</span>`;
}

function renderArchiveList(url) {
  const list = $('svcList');
  if (!url) {
    list.innerHTML = '<div class="empty">Paste a URL above and hit ⚡ Archive It to begin</div>';
    return;
  }
  let html = '';
  SERVICES.forEach(svc => {
    const archUrl = svc.archiveUrl(url);
    const loginNote = svc.login
      ? `<div class="svc-login-note">⚠ Login to your account on this service for it to work</div>`
      : '';
    const showLink = states[svc.id] === 'ok' && !svc.login;
    const linkBlock = showLink
      ? `<div class="link-block"><div class="link-label">// archive link (click to view)</div><a class="archive-url" href="${archUrl}" target="_blank" rel="noopener">${archUrl}</a></div>`
      : '';
    html += `
      <div class="svc-row" id="row-${svc.id}">
        <div class="svc-icon">${svc.icon}</div>
        <div class="svc-info">
          <div class="svc-name">${svc.name}</div>
          <div class="svc-sub">${svc.type}</div>
          ${loginNote}
          ${linkBlock}
        </div>
        <div class="svc-status">${pill(svc)}</div>
      </div>
    `;
  });
  list.innerHTML = html;
  countStats();
}

async function submitToService(svc, url) {
  states[svc.id] = 'wait';
  renderArchiveList(url);
  try {
    // 'no-cors' fires the request in the background without needing to read the response.
    // The archive services still receive the request and save the page.
    await fetch(svc.url(url), { mode: 'no-cors', method: 'GET' });
    states[svc.id] = 'ok';
  } catch (e) {
    states[svc.id] = 'err';
  }
  renderArchiveList(url);
}

async function startArchive(onlyServiceIds = null) {
  if (running) return;
  const url = $('urlInput').value.trim();
  if (!url || !url.startsWith('http')) {
    $('urlInput').style.borderColor = '#f43f5e';
    setTimeout(() => { $('urlInput').style.borderColor = '#2a2a3a'; }, 1200);
    return;
  }
  running = true;
  states = {};
  $('goBtn').disabled = true;
  $('goBtn').textContent = '⏳ Archiving...';
  renderArchiveList(url);

  // Target services: either specific ones (for "archive missing"), or all non-login by default.
  const targets = onlyServiceIds
    ? SERVICES.filter(s => onlyServiceIds.includes(s.id) && !s.login)
    : SERVICES.filter(s => !s.login);

  // Flag login-required ones visually so the user knows.
  SERVICES.filter(s => s.login).forEach(s => { states[s.id] = 'login'; });

  // Fire in sequence with a small delay to avoid stampeding.
  for (const svc of targets) {
    submitToService(svc, url);
    await new Promise(r => setTimeout(r, 350));
  }

  // Wait for in-flight requests to settle.
  await new Promise(r => setTimeout(r, targets.length * 400 + 500));

  // Save what actually succeeded to local history.
  const successful = Object.entries(states)
    .filter(([, v]) => v === 'ok')
    .map(([k]) => k);
  if (successful.length > 0) addToHistory(url, successful);

  running = false;
  $('goBtn').disabled = false;
  $('goBtn').textContent = '⚡ Archive Again';
  renderArchiveList(url);
  renderHistory();
}

$('goBtn').addEventListener('click', () => startArchive());
$('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') startArchive(); });

/* ============ SEARCH & COVERAGE CHECK ============ */

// Wayback has a public JSON availability API we can query directly from the browser.
async function checkWayback(url) {
  try {
    const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    return data.archived_snapshots?.closest || null;
  } catch { return null; }
}

function renderCoverage(url, historyEntry, waybackHit) {
  // Determine which services we know have it vs don't.
  const known = new Set(historyEntry?.archived || []);
  if (waybackHit) known.add('wayback');

  const missing = SERVICES.filter(s => !s.login && !known.has(s.id));
  const covered = SERVICES.filter(s => !s.login && known.has(s.id));

  const loginSvcs = SERVICES.filter(s => s.login);

  let waybackNote = '';
  if (waybackHit) {
    const snap = waybackHit.url ? (waybackHit.url.startsWith('http') ? waybackHit.url : 'https:' + waybackHit.url) : null;
    const ts = waybackHit.timestamp
      ? `${waybackHit.timestamp.slice(0,4)}-${waybackHit.timestamp.slice(4,6)}-${waybackHit.timestamp.slice(6,8)}`
      : '';
    waybackNote = snap
      ? `<div class="link-block" style="margin-top:14px;"><div class="link-label">// closest wayback snapshot (${ts})</div><a class="archive-url" href="${snap}" target="_blank" rel="noopener">${snap}</a></div>`
      : '';
  }

  const coverageItems = [...SERVICES].map(svc => {
    if (svc.login) {
      return `<div class="coverage-item"><span class="svc-icon">${svc.icon}</span><span class="coverage-item-name">${svc.name}</span><span class="pill pill-login">LOGIN</span></div>`;
    }
    const has = known.has(svc.id);
    return `<div class="coverage-item ${has ? 'has' : 'missing'}">
      <span class="svc-icon">${svc.icon}</span>
      <span class="coverage-item-name">${svc.name}</span>
      <span class="pill ${has ? 'pill-ok' : 'pill-miss'}">${has ? '✓' : '—'}</span>
    </div>`;
  }).join('');

  const historyLine = historyEntry
    ? `first archived ${formatDate(historyEntry.firstArchived)} • last updated ${formatDate(historyEntry.lastUpdated)}`
    : 'Not in your local history yet';

  const missingBtn = missing.length > 0
    ? `<button class="btn-accent" onclick="archiveMissing('${encodeURIComponent(url)}', ${JSON.stringify(missing.map(s => s.id)).replace(/"/g, '&quot;')})">⚡ Archive to ${missing.length} missing service${missing.length > 1 ? 's' : ''}</button>`
    : `<div style="font-family:'Space Mono',monospace;font-size:11px;color:#22d3a0;">✓ All non-login services covered</div>`;

  $('searchResults').innerHTML = `
    <div class="search-card">
      <div class="search-card-head">
        <div class="search-card-url">${url}</div>
      </div>
      <div class="coverage-stats">
        <div class="coverage-stat">COVERED: <b style="color:#22d3a0;">${covered.length}</b> / ${SERVICES.filter(s => !s.login).length}</div>
        <div class="coverage-stat">MISSING: <b style="color:#c4a04a;">${missing.length}</b></div>
        <div class="coverage-stat">LOGIN REQUIRED: <b style="color:#7c6af0;">${loginSvcs.length}</b></div>
      </div>
      <div style="font-family:'Space Mono',monospace; font-size:10px; color:#3a3858; margin-bottom:14px;">${historyLine}</div>
      <div class="coverage-grid">${coverageItems}</div>
      ${waybackNote}
      <div class="action-row">
        ${missingBtn}
        <button class="btn-secondary" onclick="sendToArchiveTab('${encodeURIComponent(url)}')">↗ Send to Archive tab</button>
      </div>
    </div>
  `;
}

function archiveMissing(encodedUrl, serviceIds) {
  const url = decodeURIComponent(encodedUrl);
  // Switch to archive tab, pre-fill URL, run only the missing services.
  document.querySelector('[data-tab="archive"]').click();
  $('urlInput').value = url;
  startArchive(serviceIds);
}

function sendToArchiveTab(encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  document.querySelector('[data-tab="archive"]').click();
  $('urlInput').value = url;
  $('urlInput').focus();
}

async function runSearch() {
  const query = $('searchInput').value.trim();
  if (!query) {
    $('searchResults').innerHTML = '';
    renderHistory();
    return;
  }

  // If it looks like a URL, run a coverage check.
  if (query.startsWith('http')) {
    $('searchResults').innerHTML = `<div class="empty" style="padding:18px;">Checking archive coverage...</div>`;
    const hist = getHistory().find(h => normUrl(h.url) === normUrl(query));
    const wayback = await checkWayback(query);
    renderCoverage(query, hist, wayback);
    renderHistory(query); // also filter history list
    return;
  }

  // Otherwise filter history by keyword.
  $('searchResults').innerHTML = '';
  renderHistory(query);
}

$('searchBtn').addEventListener('click', runSearch);
$('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

/* ============ HISTORY RENDER ============ */
function renderHistory(filter) {
  let history = getHistory();
  if (filter) {
    const f = filter.toLowerCase();
    history = history.filter(h => h.url.toLowerCase().includes(f));
  }
  const list = $('historyList');
  if (history.length === 0) {
    list.innerHTML = `<div class="empty">${filter ? 'No matching URLs in history.' : 'No archived URLs yet. Head to the Archive tab to start!'}</div>`;
    return;
  }
  list.innerHTML = history.map(h => `
    <div class="hist-row">
      <div class="hist-info">
        <div class="hist-url" title="${h.url}">${h.url}</div>
        <div class="hist-meta">last updated ${formatDate(h.lastUpdated)}</div>
      </div>
      <span class="hist-count">${(h.archived || []).length} saved</span>
      <button class="btn-secondary" onclick="inspectFromHistory('${encodeURIComponent(h.url)}')">inspect</button>
    </div>
  `).join('');
}

function inspectFromHistory(encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  $('searchInput').value = url;
  runSearch();
}

/* ============ INIT ============ */
countStats();
renderArchiveList('');
renderHistory();

// Expose functions needed by inline onclick handlers.
window.archiveMissing = archiveMissing;
window.sendToArchiveTab = sendToArchiveTab;
window.inspectFromHistory = inspectFromHistory;
