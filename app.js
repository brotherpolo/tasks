/* Cadence — app shell: navigation, theme, shortcuts, shared task actions */
(function () {
  const C = window.Cadence;
  const { D, esc, icon } = C;
  const S = C.store;
  const ROUTES = ['list', 'calendar', 'settings'];
  const NAV = [
    { id: 'list', label: 'Tasks', ic: 'list' },
    { id: 'calendar', label: 'Calendar', ic: 'calendar' },
    { id: 'settings', label: 'Settings', ic: 'settings' }
  ];
  const root = document.documentElement;
  const hostTheme = root.getAttribute('data-theme'); // the viewer may set one; "system" falls back to it
  let current = null;

  const LOGO = '<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="9" class="logo-bg"/>' +
    '<rect x="8.5" y="16" width="3.6" height="8" rx="1.8" class="logo-bar"/><rect x="14.2" y="11" width="3.6" height="13" rx="1.8" class="logo-bar"/><rect x="19.9" y="7.5" width="3.6" height="16.5" rx="1.8" class="logo-bar hi"/></svg>';

  /* ---------- helpers exposed to views ---------- */
  C.fromParse = (p) => ({
    title: p.title,
    due: p.due || (p.time ? D.todayKey() : null), // a time without a date means today
    time: p.time || null,
    typeId: p.typeId || S.state.prefs.defaultType || null,
    levelId: p.levelId || S.state.prefs.defaultLevel,
    repeat: p.repeat
  });

  C.withTransition = function (fn, dir) {
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!document.startViewTransition || reduce) return fn();
    root.dataset.dir = dir || 'none';
    try { document.startViewTransition(fn); } catch (e) { fn(); }
  };

  C.go = function (r) { if (location.hash.slice(1) !== r) location.hash = r; else route(); };

  C.completeTask = function (id, rowEl) {
    const t = S.get(id); if (!t) return;
    const wasDone = t.done;
    const tk = D.todayKey();
    if (!wasDone && rowEl) {
      const chk = rowEl.querySelector('[data-check]');
      if (chk) burst(chk, 10);
      rowEl.classList.add('completing');
      setTimeout(() => finish(), 260);
    } else finish();
    function finish() {
      const { spawned } = S.toggleDone(id);
      if (wasDone) return C.toast('Reopened “' + t.title + '”');
      const left = S.state.tasks.filter((x) => !x.done && x.due && x.due <= tk).length;
      const dueTodayCount = S.state.tasks.filter((x) => x.due === tk).length;
      if (left === 0 && dueTodayCount > 0 && (t.due || '') <= tk) {
        bigBurst();
        C.toast('Today’s list is clear. Nice work.', { action: 'Undo', onAction: () => S.toggleDone(id) });
      } else {
        C.toast(spawned ? 'Done. Next one is set for ' + C.relDate(spawned.due) : 'Completed “' + t.title + '”', { action: 'Undo', onAction: () => S.toggleDone(id) });
      }
    }
  };

  C.deleteWithUndo = function (id) {
    const t = S.deleteTask(id);
    if (t) C.toast('Deleted “' + t.title + '”', { action: 'Undo', onAction: () => S.restoreTask(t) });
  };

  /* ---------- theme ---------- */
  C.applyTheme = function () {
    const pref = S.state.prefs.theme;
    if (pref === 'light' || pref === 'dark') root.setAttribute('data-theme', pref);
    else if (hostTheme) root.setAttribute('data-theme', hostTheme);
    else root.removeAttribute('data-theme');
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.content = getComputedStyle(document.body).backgroundColor;
  };
  const isDark = () => { const a = root.getAttribute('data-theme'); return a ? a === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  C.cycleTheme = function () {
    C.withTransition(() => { S.setPrefs({ theme: isDark() ? 'light' : 'dark' }); C.applyTheme(); renderChrome(); });
  };

  /* ---------- chrome ---------- */
  function counts() {
    const tk = D.todayKey();
    const open = S.state.tasks.filter((t) => !t.done);
    return { list: open.filter((t) => t.due && t.due <= tk).length, open: open.length };
  }
  function renderChrome() {
    const c = counts();
    const r = current;
    const st = S.state;
    document.getElementById('sidebar').innerHTML =
      '<div class="brand">' + LOGO + '<span class="brand-name">Cadence</span></div>' +
      '<button type="button" class="btn primary block" data-new>' + icon('plus') + '<span>New task</span><kbd>N</kbd></button>' +
      '<button type="button" class="search-trigger" data-pal>' + icon('search') + '<span>Search or jump to…</span><kbd>⌘K</kbd></button>' +
      '<nav class="side-nav" aria-label="Primary">' + NAV.map((n) =>
        '<a href="#' + n.id + '" class="side-link' + (r === n.id ? ' on' : '') + '"' + (r === n.id ? ' aria-current="page"' : '') + '>' + icon(n.ic) + '<span>' + n.label + '</span>' +
        (n.id === 'list' && c.list ? '<span class="count mono" title="Due today or overdue">' + c.list + '</span>' : '') + '</a>').join('') + '</nav>' +
      sideTypes(st) + sideLevels(st) +
      '<div class="side-foot">' +
      C.syncPill() +
      '<button type="button" class="icon-btn" data-theme-toggle aria-label="Toggle dark mode">' + icon(isDark() ? 'sun' : 'moon') + '</button></div>';

    document.getElementById('topbar').innerHTML =
      '<div class="brand">' + LOGO + '<span class="brand-name">Cadence</span></div><span class="spacer"></span>' + C.syncPill(true) +
      '<button type="button" class="icon-btn" data-theme-toggle aria-label="Toggle dark mode">' + icon(isDark() ? 'sun' : 'moon') + '</button>';

    document.getElementById('tabbar').innerHTML =
      tab('list', 'Tasks', 'list', c.list) + tab('calendar', 'Calendar', 'calendar') +
      '<button type="button" class="fab" data-new aria-label="New task">' + icon('plus') + '</button>' +
      '<button type="button" class="tab" data-pal>' + icon('search') + '<span>Search</span></button>' +
      tab('settings', 'Settings', 'settings');
  }
  function sideTypes(st) {
    const active = C.views.list.activeTypes();
    return '<div class="side-sec"><div class="side-sec-head"><span class="eyebrow">Types</span>' +
      (active.size ? '<button type="button" class="side-clear" data-side-clear>Show all</button>' : '') + '</div>' +
      '<ul class="side-types">' + st.types.map((t) => {
        const n = st.tasks.filter((x) => !x.done && x.typeId === t.id).length;
        const on = active.has(t.id);
        return '<li><button type="button" class="side-type' + (on ? ' on' : '') + '" data-side-type="' + t.id + '" aria-pressed="' + on + '" title="' + (on ? 'Show all types' : 'Show only ' + esc(t.name)) + '" style="--c:' + t.color + '">' +
          icon(t.glyph) + '<span>' + esc(t.name) + '</span><span class="mono muted">' + n + '</span></button></li>';
      }).join('') + '</ul></div>';
  }
  function sideLevels(st) {
    const active = C.views.list.activeLevels();
    return '<div class="side-sec"><div class="side-sec-head"><span class="eyebrow">Importance</span>' +
      (active.size ? '<button type="button" class="side-clear" data-side-clear-level>Show all</button>' : '') + '</div>' +
      '<ul class="side-types">' + st.levels.map((l) => {
        const n = st.tasks.filter((x) => !x.done && x.levelId === l.id).length;
        const on = active.has(l.id);
        return '<li><button type="button" class="side-type' + (on ? ' on' : '') + '" data-side-level="' + l.id + '" aria-pressed="' + on + '" title="' + (on ? 'Show all importance levels' : 'Show only ' + esc(l.name)) + '" style="--c:' + l.color + '">' +
          '<i class="dot side-dot"></i><span>' + esc(l.name) + '</span><span class="mono muted">' + n + '</span></button></li>';
      }).join('') + '</ul></div>';
  }
  C.refreshChrome = () => renderChrome();

  /* ---------- sync status pill ---------- */
  const SYNC = {
    local: ['device', 'On this device', 'Tasks are saved in this browser only.'],
    connecting: ['cloud', 'Connecting…', 'Connecting to your account…'],
    synced: ['cloud', 'Synced', 'All changes are saved to your account.'],
    saving: ['cloud', 'Saving…', 'Sending changes to your account…'],
    offline: ['cloud', 'Offline', 'You’re offline. Changes are kept here and sent when you reconnect.'],
    error: ['cloud', 'Sync error', 'Sync stopped. Tap for details.']
  };
  C.ago = function (t) {
    if (!t) return 'never';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 10) return 'just now';
    if (s < 60) return s + 's ago';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    return C.F.time.format(new Date(t));
  };
  C.syncPill = function (compact) {
    const sy = S.state.sync;
    const [ic, label, tip] = SYNC[sy.status] || SYNC.local;
    const title = sy.status === 'error' && sy.error ? sy.error.title + '. ' + 'Tap for details.'
      : sy.status === 'synced' ? tip + ' Last synced ' + C.ago(sy.lastAt) + '.' : tip;
    return '<button type="button" class="sync-pill s-' + sy.status + (compact ? ' compact' : '') + '" data-sync-pill title="' + esc(title) + '" aria-label="Sync status: ' + esc(label) + '. Open sync details">' +
      '<span class="sync-dot" aria-hidden="true"></span>' + icon(ic) + '<span class="sync-label">' + label + '</span></button>';
  };
  // keep "last synced" tooltips fresh
  setInterval(() => document.querySelectorAll('[data-sync-pill]').forEach((b) => { b.outerHTML = C.syncPill(b.classList.contains('compact')); }), 30000);

  function tab(id, label, ic, n) {
    return '<a href="#' + id + '" class="tab' + (current === id ? ' on' : '') + '"' + (current === id ? ' aria-current="page"' : '') + '>' +
      '<span class="tab-ic">' + icon(ic) + (n ? '<span class="tab-badge mono">' + n + '</span>' : '') + '</span><span>' + label + '</span></a>';
  }

  /* ---------- routing ---------- */
  function route() {
    const r = ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'list';
    if (r === current) return;
    const prevIdx = ROUTES.indexOf(current);
    C.withTransition(() => {
      if (current && C.views[current].unmount) C.views[current].unmount();
      current = r;
      const v = document.getElementById('view');
      v.innerHTML = '';
      const fresh = v.cloneNode(false); v.replaceWith(fresh); // drop old listeners
      C.views[r].mount(fresh);
      document.title = C.views[r].title + ' · Cadence';
      renderChrome();
      window.scrollTo(0, 0);
    }, prevIdx < 0 ? null : ROUTES.indexOf(r) > prevIdx ? 'fwd' : 'back');
  }

  /* ---------- global events ---------- */
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-new]') && !e.target.closest('#view')) { e.preventDefault(); C.openEditor(); }
    else if (e.target.closest('[data-pal]')) C.openPalette();
    else if (e.target.closest('[data-sync-pill]')) {
      const reveal = () => { const c = document.getElementById('st-sync'); if (c) { c.scrollIntoView({ behavior: 'smooth', block: 'center' }); c.classList.add('flash-card'); setTimeout(() => c.classList.remove('flash-card'), 1200); } };
      if (current !== 'settings') { C.go('settings'); setTimeout(reveal, 350); } else reveal();
    }
    else if (e.target.closest('[data-side-type]')) {
      C.views.list.filterType(e.target.closest('[data-side-type]').dataset.sideType);
      if (current !== 'list') C.go('list'); else window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    else if (e.target.closest('[data-side-clear]')) { C.views.list.clearTypes(); if (current !== 'list') C.go('list'); }
    else if (e.target.closest('[data-side-level]')) {
      C.views.list.filterLevel(e.target.closest('[data-side-level]').dataset.sideLevel);
      if (current !== 'list') C.go('list'); else window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    else if (e.target.closest('[data-side-clear-level]')) { C.views.list.clearLevels(); if (current !== 'list') C.go('list'); }
    else if (e.target.closest('[data-theme-toggle]')) C.cycleTheme();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); return C.openPalette(); }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (document.querySelector('.sheet-wrap,.pal-wrap')) return;
    const k = e.key;
    if (k === 'n' || k === 'N') { e.preventDefault(); C.openEditor(); }
    else if (k === '/') { e.preventDefault(); if (current !== 'list') { C.go('list'); setTimeout(() => C.views.list.focusSearch(), 60); } else C.views.list.focusSearch(); }
    else if (k === '1' || k === '2' || k === '3') C.go(ROUTES[Number(k) - 1]);
    else if (k === 'd' || k === 'D') C.cycleTheme();
    else if ((k === 't' || k === 'T') && current === 'calendar') C.views.calendar.shift(0);
    else if (k === 'ArrowLeft' && current === 'calendar') C.views.calendar.shift(-1);
    else if (k === 'ArrowRight' && current === 'calendar') C.views.calendar.shift(1);
  });

  window.addEventListener('hashchange', route);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { C.applyTheme(); renderChrome(); });

  /* calendar drops */
  C.drag.init((id, day) => {
    const t = S.get(id); if (!t) return;
    const prev = { due: t.due, time: t.time };
    if ((t.due || null) === (day || null)) return;
    S.updateTask(id, day ? { due: day } : { due: null, time: null });
    C.toast(day ? 'Moved to ' + C.F.long.format(D.parse(day)) : 'Unscheduled “' + t.title + '”', { action: 'Undo', onAction: () => S.updateTask(id, prev) });
  });

  /* ---------- delight: completion bursts ---------- */
  function burst(anchor, n) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = anchor.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const colors = S.state.types.map((t) => t.color).concat(S.state.levels.map((l) => l.color));
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.className = 'spark';
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.4, dist = 18 + Math.random() * 22;
      s.style.cssText = 'left:' + cx + 'px;top:' + cy + 'px;--dx:' + Math.cos(a) * dist + 'px;--dy:' + Math.sin(a) * dist + 'px;--c:' + colors[i % colors.length];
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 700);
    }
  }
  function bigBurst() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = S.state.types.map((t) => t.color).concat(S.state.levels.map((l) => l.color));
    for (let i = 0; i < 48; i++) {
      const s = document.createElement('i');
      s.className = 'confetti';
      s.style.cssText = 'left:' + (Math.random() * 100) + 'vw;--c:' + colors[i % colors.length] + ';--r:' + (Math.random() * 720 - 360) + 'deg;--d:' + (900 + Math.random() * 900) + 'ms;--x:' + (Math.random() * 80 - 40) + 'px;animation-delay:' + (Math.random() * 200) + 'ms';
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 2200);
    }
  }

  /* ---------- boot ---------- */
  let raf = 0;
  S.subscribe(() => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!current) return;
      renderChrome();
      C.views[current].update();
    });
  });
  // refresh "today" when the date rolls over while the app is open
  let lastDay = D.todayKey();
  setInterval(() => { if (D.todayKey() !== lastDay) { lastDay = D.todayKey(); const r = current; current = null; location.hash = r; route(); } }, 60000);

  C.applyTheme();
  route();
  S.init().then(() => { C.applyTheme(); });
})();
