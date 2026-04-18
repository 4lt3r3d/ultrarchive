/* =====================================================
   ULTRARCHIVE — script.js
   Real-verified archive submission, search, history.
   ===================================================== */

const SERVICES = [
  {
    id: 'wayback',
    icon: '🕰',
    name: 'Wayback Machine',
    type: 'Public Snapshot',
    desc: "The internet's library. 800B+ pages.",
    submit: u => fetch(`https://web.archive.org/save/${u}`, { mode: 'no-cors' }).catch(()=>{}),
    verify: async (u, submitStartTime) => {
      try {
        const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(u)}&timestamp=${Date.now()}`);
        const data = await res.json();
        const snap = data?.archived_snapshots?.closest;
        if (snap?.available && snap.url) {
          // Check if snapshot is recent (after we started submitting)
          const ts = snap.timestamp;
          const snapDate = new Date(Date.UTC(
            parseInt(ts.slice(0,4)),
            parseInt(ts.slice(4,6)) - 1,
            parseInt(ts.slice(6,8)),
            parseInt(ts.slice(8,10)),
            parseInt(ts.slice(10,12)),
            parseInt(ts.slice(12,14))
          )).getTime();
          const url = snap.url.startsWith('http') ? snap.url : 'https:' + snap.url;
          // If snapshot is from after we started, it's almost certainly ours
          const isFresh = submitStartTime ? (snapDate >= submitStartTime - 60000) : true;
          return { ok: true, archiveUrl: url, timestamp: ts, isFresh };
        }
        return null;
      } catch { return null; }
    },
    manualUrl: u => `https://web.archive.org/web/*/${u}`,
    login: false,
  },

  {
    id: 'archivetoday',
    icon: '📸',
    name: 'Archive.today',
    type: 'Full Snapshot',
    desc: 'HTML + screenshot. Bypasses robots.txt.',
    submit: u => fetch(`https://archive.ph/?run=1&url=${encodeURIComponent(u)}`, { mode: 'no-cors' }).catch(()=>{}),
    verify: async () => ({ ok: null, unverifiable: true }),
    manualUrl: u => `https://archive.ph/newest/${u}`,
    login: false,
  },

  {
    id: 'ghostarchive',
    icon: '👻',
    name: 'Ghost Archive',
    type: 'Dynamic + Video',
    desc: 'JS-heavy sites & YouTube archiving.',
    submit: u => fetch(`https://ghostarchive.org/archive?term=${encodeURIComponent(u)}`, { mode: 'no-cors' }).catch(()=>{}),
    verify: async () => ({ ok: null, unverifiable: true }),
    manualUrl: u => `https://ghostarchive.org/search?term=${encodeURIComponent(u)}`,
    login: false,
  },

  {
    id: 'memento',
    icon: '⏱',
    name: 'Memento Time Travel',
    type: 'Archive Search (30+ archives)',
    desc: 'Aggregator — checks if ANY archive has it.',
    submit: () => Promise.resolve(),
    verify: async (u) => {
      try {
        const res = await fetch(`https://timetravel.mementoweb.org/api/json/${Date.now()}/${u}`);
        const data = await res.json();
        if (data?.mementos?.closest?.uri?.[0]) {
          return { ok: true, archiveUrl: data.mementos.closest.uri[0] };
        }
        return { ok: false };
      } catch { return null; }
    },
    manualUrl: u => `https://timetravel.mementoweb.org/timemap/link/${u}`,
    login: false,
    lookupOnly: true,
  },

  {
    id: 'preservetube',
    icon: '📹',
    name: 'PreserveTube',
    type: 'YouTube Videos Only',
    desc: 'Save YouTube videos before they vanish.',
    submit: u => fetch(`https://preservetube.com/`, { mode: 'no-cors' }).catch(()=>{}),
    verify: async () => ({ ok: null, unverifiable: true }),
    manualUrl: u => `https://preservetube.com/`,
    login: false,
    youtubeOnly: true,
  },

  {
    id: 'permacc',
    icon: '🔗',
    name: 'Perma.cc',
    type: 'Permanent Citation Link',
    desc: 'Harvard Law-backed. Legal-grade.',
    login: true,
    manualUrl: u => `https://perma.cc/`,
    signupUrl: 'https://perma.cc/sign-up',
  },

  {
    id: 'archiveit',
    icon: '🏛',
    name: 'Archive-It',
    type: 'Institutional (paid)',
    desc: "Internet Archive's pro crawl service.",
    login: true,
    manualUrl: u => `https://archive-it.org/`,
    signupUrl: 'https://archive-it.org/contact-us/',
  },

  {
    id: 'ukweb',
    icon: '🇬🇧',
    name: 'UK Web Archive',
    type: 'UK National',
    desc: 'British Library. Best for .uk domains.',
    login: true,
    manualUrl: u => `https://www.webarchive.org.uk/en/ukwa/info/nominate`,
    signupUrl: 'https://www.webarchive.org.uk/en/ukwa/info/nominate',
  },
];

/* ============ STATE ============ */
let states = {};
let archiveUrls = {};
let running = false;
const HISTORY_KEY = 'ultrarchive_history';

/* ============ HELPERS ============ */
function normUrl(u) { return (u || '').trim().replace(/\/+$/, '').toLowerCase(); }
function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function $(id) { return document.getElementById(id); }
function isYouTube(u) { return /(?:youtube\.com|youtu\.be)/i.test(u); }

/* ============ LOCAL HISTORY ============ */
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(list) { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); }

function addToHistory(url, results) {
  let history = getHistory();
  const norm = normUrl(url);
  const existing = history.find(h => normUrl(h.url) === norm);

  if (existing) {
    existing.results = { ...(existing.results || {}), ...results };
    existing.lastUpdated = Date.now();
    history = [existing, ...history.filter(h => h !== existing)];
  } else {
    history.unshift({
      url,
      results,
      firstArchived: Date.now(),
      lastUpdated: Date.now(),
    });
  }
  history = history.slice(0, 200);
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
  const verified = Object.values(states).filter(s => s === 'verified').length;
  const submitted = Object.values(states).filter(s => s === 'submitted-unverified').length;
  const pending = Object.values(states).filter(s => s === 'submitting' || s === 'verifying').length;
  const loginCount = SERVICES.filter(s => s.login).length;

  $('sTotal').textContent = SERVICES.length;
  $('sOk').textContent = verified;
  $('sPend').textContent = pending;
  $('sLogin').textContent = loginCount;

  const nonLogin = SERVICES.filter(s => !s.login && !s.lookupOnly).length;
  const pct = nonLogin > 0 ? Math.round((verified / nonLogin) * 100) : 0;
  $('progressFill').style.width = pct + '%';
}

function pill(svc) {
  const s = states[svc.id];
  if (svc.login)                       return `<span class="pill pill-login">NEEDS LOGIN</span>`;
  if (s === 'submitting')              return `<span class="pill pill-wait">SUBMITTING</span><div class="spin"></div>`;
  if (s === 'verifying')               return `<span class="pill pill-wait">VERIFYING</span><div class="spin"></div>`;
  if (s === 'verified')                return `<span class="pill pill-ok">✓ CONFIRMED</span>`;
  if (s === 'submitted-unverified')    return `<span class="pill pill-warn">SENT — VERIFY MANUALLY</span>`;
  if (s === 'not-found')               return `<span class="pill pill-err">NOT CONFIRMED</span>`;
  if (s === 'skipped')                 return `<span class="pill pill-idle">SKIPPED</span>`;
  return                                       `<span class="pill pill-idle">READY</span>`;
}

function renderArchiveList(url) {
  const list = $('svcList');
  if (!url) {
    list.innerHTML = '<div class="empty">Paste a URL above and hit ⚡ Archive It to begin</div>';
    return;
  }

  let html = '';
  SERVICES.forEach(svc => {
    const state = states[svc.id];
    let linkBlock = '';
    let extraSub = '';

    if (svc.login) {
      linkBlock = `
        <div class="action-row-mini">
          <a class="btn-signup" href="${svc.signupUrl}" target="_blank" rel="noopener">↗ Create account / Sign in</a>
          <a class="btn-manual" href="${svc.manualUrl(url)}" target="_blank" rel="noopener">↗ Submit manually</a>
        </div>
      `;
    } else if (state === 'skipped' && svc.youtubeOnly) {
      extraSub = ' • skipped — not a YouTube URL';
    } else if (state === 'verified' && archiveUrls[svc.id]) {
      linkBlock = `<div class="link-block">
        <div class="link-label">// ✓ verified archive link — click to open</div>
        <a class="archive-url" href="${archiveUrls[svc.id]}" target="_blank" rel="noopener">${archiveUrls[svc.id]}</a>
      </div>`;
    } else if (state === 'submitted-unverified') {
      linkBlock = `<div class="link-block warn">
        <div class="link-label">// submission sent • browser can't auto-verify this service due to CORS • check manually:</div>
        <a class="archive-url" href="${svc.manualUrl(url)}" target="_blank" rel="noopener">${svc.manualUrl(url)}</a>
      </div>`;
    } else if (state === 'not-found') {
      linkBlock = `<div class="link-block err">
        <div class="link-label">// archive not confirmed • try submitting manually:</div>
        <a class="archive-url" href="${svc.manualUrl(url)}" target="_blank" rel="noopener">${svc.manualUrl(url)}</a>
      </div>`;
    }

    html += `
      <div class="svc-row" id="row-${svc.id}">
        <div class="svc-icon">${svc.icon}</div>
        <div class="svc-info">
          <div class="svc-name">${svc.name}</div>
          <div class="svc-sub">${svc.type}${extraSub}</div>
          ${linkBlock}
        </div>
        <div class="svc-status">${pill(svc)}</div>
      </div>
    `;
  });

  list.innerHTML = html;
  countStats();
}

/* ============ PROCESS ONE SERVICE ============ */
async function processService(svc, url, submitStartTime) {
  if (svc.login) return null;

  // Skip YouTube-only services for non-YouTube URLs
  if (svc.youtubeOnly && !isYouTube(url)) {
    states[svc.id] = 'skipped';
    renderArchiveList(url);
    return { id: svc.id, status: 'skipped' };
  }

  // STEP 1: Submit (unless lookup-only)
  if (!svc.lookupOnly) {
    states[svc.id] = 'submitting';
    renderArchiveList(url);
    try { if (svc.submit) await svc.submit(url); } catch {}
  }

  // STEP 2: Verify with polling
  if (svc.verify) {
    states[svc.id] = 'verifying';
    renderArchiveList(url);

    // Lookup-only: check once. Submit+verify: poll up to 8 times over ~40 sec.
    const maxAttempts = svc.lookupOnly ? 1 : 10;
    const delay = svc.lookupOnly ? 0 : 4000;

    let verified = null;
    for (let i = 0; i < maxAttempts; i++) {
      if (i > 0 || !svc.lookupOnly) await new Promise(r => setTimeout(r, delay));
      const result = await svc.verify(url, submitStartTime);

      if (result?.ok === true) {
        // For wayback, make sure it's a fresh snapshot (recently made)
        if (svc.id === 'wayback' && !svc.lookupOnly && !result.isFresh && i < maxAttempts - 1) {
          // Older snapshot — wait for a fresh one
          continue;
        }
        verified = result;
        break;
      }
      if (result?.unverifiable) {
        states[svc.id] = 'submitted-unverified';
        renderArchiveList(url);
        return { id: svc.id, status: 'submitted-unverified' };
      }
    }

    if (verified) {
      states[svc.id] = 'verified';
      archiveUrls[svc.id] = verified.archiveUrl;
      renderArchiveList(url);
      return { id: svc.id, status: 'verified', archiveUrl: verified.archiveUrl };
    } else {
      states[svc.id] = 'not-found';
      renderArchiveList(url);
      return { id: svc.id, status: 'not-found' };
    }
  }

  return null;
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
  archiveUrls = {};
  const submitStartTime = Date.now();
  $('goBtn').disabled = true;
  $('goBtn').textContent = '⏳ Archiving...';
  renderArchiveList(url);

  const targets = onlyServiceIds
    ? SERVICES.filter(s => onlyServiceIds.includes(s.id) && !s.login)
    : SERVICES.filter(s => !s.login);

  const results = await Promise.all(targets.map(svc => processService(svc, url, submitStartTime)));
  const resultsMap = {};
  results.filter(Boolean).forEach(r => {
    resultsMap[r.id] = { status: r.status, archiveUrl: r.archiveUrl };
  });

  if (Object.keys(resultsMap).length > 0) addToHistory(url, resultsMap);

  running = false;
  $('goBtn').disabled = false;
  $('goBtn').textContent = '⚡ Archive Again';
  renderArchiveList(url);
  renderHistory();
}

$('goBtn').addEventListener('click', () => startArchive());
$('urlInput').addEventListener('keydown', e => { if (e.key === 'Enter') startArchive(); });

/* ============ SEARCH & COVERAGE ============ */
async function checkWayback(url) {
  try {
    const res = await fetch(`https://archive.org/wayback/available?url=${encodeURIComponent(url)}`);
    const data = await res.json();
    return data?.archived_snapshots?.closest || null;
  } catch { return null; }
}

async function checkMemento(url) {
  try {
    const res = await fetch(`https://timetravel.mementoweb.org/api/json/${Date.now()}/${url}`);
    const data = await res.json();
    return data?.mementos?.closest?.uri?.[0] || null;
  } catch { return null; }
}

function renderCoverage(url, historyEntry, waybackHit, mementoHit) {
  const histResults = historyEntry?.results || {};
  const verifiedIds = new Set(Object.entries(histResults).filter(([,v]) => v?.status === 'verified').map(([k]) => k));
  if (waybackHit) verifiedIds.add('wayback');
  if (mementoHit) verifiedIds.add('memento');

  const submittedIds = new Set(Object.entries(histResults).filter(([,v]) => v?.status === 'submitted-unverified').map(([k]) => k));
  const nonLogin = SERVICES.filter(s => !s.login);
  const missing = nonLogin.filter(s => !verifiedIds.has(s.id) && !submittedIds.has(s.id));

  let waybackNote = '';
  if (waybackHit) {
    const snap = waybackHit.url.startsWith('http') ? waybackHit.url : 'https:' + waybackHit.url;
    const ts = waybackHit.timestamp;
    const prettyTs = ts ? `${ts.slice(0,4)}-${ts.slice(4,6)}-${ts.slice(6,8)}` : '';
    waybackNote = `<div class="link-block" style="margin-top:14px;">
      <div class="link-label">// ✓ wayback machine snapshot (${prettyTs})</div>
      <a class="archive-url" href="${snap}" target="_blank" rel="noopener">${snap}</a>
    </div>`;
  }

  let mementoNote = '';
  if (mementoHit && mementoHit !== waybackHit?.url) {
    mementoNote = `<div class="link-block" style="margin-top:14px;">
      <div class="link-label">// ✓ memento aggregator found a snapshot</div>
      <a class="archive-url" href="${mementoHit}" target="_blank" rel="noopener">${mementoHit}</a>
    </div>`;
  }

  const coverageItems = SERVICES.map(svc => {
    if (svc.login) {
      return `<div class="coverage-item"><span class="svc-icon">${svc.icon}</span><span class="coverage-item-name">${svc.name}</span><span class="pill pill-login">LOGIN</span></div>`;
    }
    const isVerified = verifiedIds.has(svc.id);
    const isSubmitted = submittedIds.has(svc.id);
    let pillHtml = `<span class="pill pill-miss">—</span>`;
    let cls = 'missing';
    if (isVerified) { pillHtml = `<span class="pill pill-ok">✓</span>`; cls = 'has'; }
    else if (isSubmitted) { pillHtml = `<span class="pill pill-warn">~</span>`; cls = 'partial'; }
    return `<div class="coverage-item ${cls}"><span class="svc-icon">${svc.icon}</span><span class="coverage-item-name">${svc.name}</span>${pillHtml}</div>`;
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
        <div class="coverage-stat">VERIFIED: <b style="color:#22d3a0;">${verifiedIds.size}</b> / ${nonLogin.length}</div>
        <div class="coverage-stat">SUBMITTED: <b style="color:#c4a04a;">${submittedIds.size}</b></div>
        <div class="coverage-stat">MISSING: <b style="color:#f43f5e;">${missing.length}</b></div>
      </div>
      <div style="font-family:'Space Mono',monospace; font-size:10px; color:#3a3858; margin-bottom:14px;">${historyLine}</div>
      <div class="coverage-grid">${coverageItems}</div>
      ${waybackNote}
      ${mementoNote}
      <div class="action-row">
        ${missingBtn}
        <button class="btn-secondary" onclick="sendToArchiveTab('${encodeURIComponent(url)}')">↗ Send to Archive tab</button>
      </div>
    </div>
  `;
}

function archiveMissing(encodedUrl, serviceIds) {
  const url = decodeURIComponent(encodedUrl);
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
  if (!query) { $('searchResults').innerHTML = ''; renderHistory(); return; }

  if (query.startsWith('http')) {
    $('searchResults').innerHTML = `<div class="empty" style="padding:18px;">Checking archive coverage across services...</div>`;
    const hist = getHistory().find(h => normUrl(h.url) === normUrl(query));
    const [wayback, memento] = await Promise.all([checkWayback(query), checkMemento(query)]);
    renderCoverage(query, hist, wayback, memento);
    renderHistory(query);
    return;
  }

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
  list.innerHTML = history.map(h => {
    const verifiedCount = Object.values(h.results || {}).filter(r => r?.status === 'verified').length;
    const submittedCount = Object.values(h.results || {}).filter(r => r?.status === 'submitted-unverified').length;
    return `
      <div class="hist-row">
        <div class="hist-info">
          <div class="hist-url" title="${h.url}">${h.url}</div>
          <div class="hist-meta">last updated ${formatDate(h.lastUpdated)}</div>
        </div>
        <span class="hist-count">${verifiedCount} verified${submittedCount ? ` • ${submittedCount} sent` : ''}</span>
        <button class="btn-secondary" onclick="inspectFromHistory('${encodeURIComponent(h.url)}')">inspect</button>
      </div>
    `;
  }).join('');
}

function inspectFromHistory(encodedUrl) {
  const url = decodeURIComponent(encodedUrl);
  document.querySelector('[data-tab="search"]').click();
  $('searchInput').value = url;
  runSearch();
}

/* ============ INIT ============ */
countStats();
renderArchiveList('');
renderHistory();

window.archiveMissing = archiveMissing;
window.sendToArchiveTab = sendToArchiveTab;
window.inspectFromHistory = inspectFromHistory;function renderCoverage(url, historyEntry, waybackHit) {
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
