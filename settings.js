/* Cadence — Settings: task types, importance levels, preferences, data */
(function () {
  const C = window.Cadence;
  const { esc, icon } = C;
  const S = () => C.store;
  const SWATCHES = ['#E5383B', '#F08A24', '#D9A400', '#4C9A2A', '#0E8F7E', '#1F8FBF', '#3B6FE0', '#5B5BD6', '#8A55D6', '#D23F6E', '#C2410C', '#8C94A6'];
  const ui = { pop: null, confirm: null, reset: false, msg: null };
  let el = null;

  const view = (C.views = C.views || {}).settings = {
    title: 'Settings',
    mount(root) {
      el = root;
      root.innerHTML = '<section class="page settings-page"><header class="page-head"><p class="eyebrow">Make it yours</p><h1 class="display">Settings</h1></header><div id="st-root"></div></section>';
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      view.update();
    },
    update() {
      if (!el) return;
      const a = document.activeElement;
      if (a && el.contains(a) && a.matches('input[type=text]') && !ui.force) return; // don't clobber typing
      ui.force = false;
      render();
    },
    unmount() { el = null; }
  };

  function count(field, id) { return S().state.tasks.filter((t) => t[field] === id).length; }

  function render() {
    const st = S().state, p = st.prefs;
    const types = st.types, levels = st.levels;
    el.querySelector('#st-root').innerHTML =
      '<div class="st-grid">' +

      section('Task types', 'Group tasks by the kind of work. Colors show on the calendar.',
        '<ul class="st-list">' + types.map((t, i) => itemRow('type', t, i, types.length, count('typeId', t.id))).join('') + '</ul>' +
        '<button type="button" class="btn add-row" data-add="type">' + icon('plus') + '<span>Add type</span></button>') +

      section('Importance levels', 'Ordered from most to least important. Sorting and the calendar follow this order.',
        '<ul class="st-list">' + levels.map((l, i) => itemRow('level', l, i, levels.length, count('levelId', l.id))).join('') + '</ul>' +
        '<button type="button" class="btn add-row" data-add="level">' + icon('plus') + '<span>Add level</span></button>' +
        '<p class="fine">Quick add: type <b>!' + esc((levels[0] || { name: 'high' }).name.toLowerCase()) + '</b>, <b>!1</b> for the top level, or <b>!!</b> as a shortcut for it.</p>') +

      section('Preferences', 'Saved on this device.',
        prefRow('Appearance', seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], p.theme)) +
        prefRow('Week starts on', seg('weekStart', [['0', 'Sunday'], ['1', 'Monday']], String(p.weekStart))) +
        prefRow('New tasks are', '<div class="row2">' +
          '<label class="select-wrap"><span class="sr">Default importance</span><select id="st-deflevel" data-pref="defaultLevel">' + levels.map((l) => '<option value="' + l.id + '"' + (p.defaultLevel === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select></label>' +
          '<label class="select-wrap"><span class="sr">Default type</span><select id="st-deftype" data-pref="defaultType"><option value="">No type</option>' + types.map((t) => '<option value="' + t.id + '"' + (p.defaultType === t.id ? ' selected' : '') + '>' + esc(t.name) + '</option>').join('') + '</select></label></div>')) +

      section('Your data', '',
        syncCard(st) +
        '<div class="btn-row">' +
        '<button type="button" class="btn" data-act="export">' + icon('download') + '<span>Export backup</span></button>' +
        '<label class="btn" for="st-import">' + icon('upload') + '<span>Import backup</span></label><input id="st-import" type="file" accept="application/json,.json" class="sr">' +
        '<button type="button" class="btn" data-act="copy">' + icon('note') + '<span>Copy as JSON</span></button>' +
        '</div>' +
        '<div class="btn-row">' +
        '<button type="button" class="btn" data-act="samples">' + icon('sparkle') + '<span>Add example tasks</span></button>' +
        '<button type="button" class="btn" data-act="clearDone">' + icon('check') + '<span>Delete completed (' + st.tasks.filter((t) => t.done).length + ')</span></button>' +
        (ui.reset
          ? '<span class="confirm">Delete every task and restore default settings? <button type="button" class="btn sm danger-solid" data-act="resetYes">Erase everything</button><button type="button" class="btn sm ghost" data-act="resetNo">Keep my data</button></span>'
          : '<button type="button" class="btn ghost danger" data-act="reset">' + icon('trash') + '<span>Reset everything</span></button>') +
        '</div>' + (ui.msg ? '<p class="fine status-msg">' + esc(ui.msg) + '</p>' : '') +
        '<textarea id="st-json" class="sr" readonly aria-hidden="true" tabindex="-1"></textarea>') +

      section('Keyboard shortcuts', '',
        '<dl class="keys">' + [['N', 'New task'], ['/', 'Search tasks'], ['⌘K / Ctrl K', 'Command menu'], ['1 · 2 · 3', 'Tasks · Calendar · Settings'], ['← →', 'Previous / next on the calendar'], ['T', 'Jump to today'], ['D', 'Cycle light / dark'], ['X', 'Complete the focused task'], ['⌘↵', 'Save in the editor']].map(([k, v]) => '<div><dt>' + k.split(' ').map((x) => /^[·/]$/.test(x) && k.length > 2 ? '<span class="muted">' + x + '</span>' : '<kbd>' + x + '</kbd>').join('') + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>') +

      '</div>';
  }

  function syncCard(st) {
    const sy = st.sync, fb = C.firebaseSync;
    const head = {
      local: ['Saved in this browser', fb && fb.enabled ? 'Not connected to your account. Press Retry to connect.' : 'Tasks stay on this device. Export a backup to move them somewhere else.'],
      connecting: ['Connecting…', 'Reaching your account.'],
      synced: ['Synced to your account', 'Your tasks follow you to every device you sign in on. Only you can see them.'],
      saving: ['Saving changes…', sy.pending + ' change' + (sy.pending === 1 ? '' : 's') + ' on the way.'],
      offline: ['Offline', 'Changes are kept on this device and sent when you’re back online.'],
      error: ['Sync isn’t working', 'Your changes are safe on this device. Fix the problem below, then press Retry.']
    }[sy.status] || ['Saved in this browser', ''];
    const rows = [];
    if (sy.provider) rows.push(['Service', sy.provider === 'firebase' ? 'Firebase' + (fb && fb.projectId ? ' · <span class="mono">' + esc(fb.projectId) + '</span>' : '') : 'Claude account']);
    if (fb && fb.user) {
      const how = { 'google.com': 'Google', password: 'email + password' }[fb.user.method] || fb.user.method;
      rows.push(['Signed in as', '<span class="mono">' + esc(fb.user.email || fb.user.name || 'you') + '</span> <span class="muted">(' + esc(how) + ')</span>']);
      rows.push(['Account ID', '<span class="mono">' + esc(fb.user.uid.slice(0, 8)) + '</span> <span class="muted">must match on every device</span>']);
    }
    if (sy.provider) rows.push(['Last synced', esc(C.ago(sy.lastAt))]);
    rows.push(['On this device', '<span class="mono">' + st.tasks.length + '</span> tasks']);
    if (sy.provider) rows.push(['In the cloud', sy.cloudCount == null ? '<span class="muted">not reached yet</span>' : '<span class="mono">' + sy.cloudCount + '</span> tasks']);
    rows.push(['App version', '<span class="mono">' + esc(C.VERSION || '?') + '</span>']);
    const err = sy.status === 'error' && sy.error;
    return '<div class="sync-card s-' + sy.status + '" id="st-sync">' +
      '<div class="sync-top">' + C.syncPill() + '<span class="spacer"></span>' +
      (sy.provider || (fb && fb.enabled) ? '<button type="button" class="btn sm" data-act="retry"' + (sy.status === 'connecting' ? ' disabled' : '') + '>' + icon('repeat') + '<span>Retry sync</span></button>' : '') +
      (fb && fb.user ? '<button type="button" class="btn sm ghost" data-act="signout">Sign out</button>' : '') + '</div>' +
      '<div><b>' + head[0] + '</b><p>' + head[1] + '</p></div>' +
      (err ? '<div class="sync-err" role="alert"><b>' + esc(err.title) + '</b><p>' + esc(err.hint) + '</p>' +
        '<p class="mono sync-raw">' + esc(err.code) + (err.doc ? ' · ' + esc(err.doc) : '') + (err.raw && err.raw !== err.hint ? ' · ' + esc(err.raw) : '') + '</p></div>' : '') +
      '<dl class="sync-facts">' + rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('') + '</dl>' +
      '</div>';
  }

  function section(title, sub, inner) {
    return '<section class="st-sec"><header><h2>' + title + '</h2>' + (sub ? '<p class="muted">' + sub + '</p>' : '') + '</header>' + inner + '</section>';
  }
  function prefRow(label, ctl) { return '<div class="pref"><span class="pref-l">' + label + '</span>' + ctl + '</div>'; }
  function seg(key, opts, val) {
    return '<div class="seg mini" role="radiogroup">' + opts.map(([v, l]) => '<button type="button" role="radio" aria-checked="' + (v === val) + '" class="seg-btn' + (v === val ? ' on' : '') + '" data-seg="' + key + '" data-val="' + v + '">' + l + '</button>').join('') + '</div>';
  }

  function itemRow(kind, it, i, n, used) {
    const key = kind + ':' + it.id;
    const isDefault = kind === 'level' && S().state.prefs.defaultLevel === it.id;
    const confirming = ui.confirm === key;
    return '<li class="st-item' + (confirming ? ' confirming' : '') + '" style="--c:' + it.color + '">' +
      '<button type="button" class="swatch" data-pop="' + key + '" aria-label="Change color" aria-expanded="' + (ui.pop === key) + '">' + (kind === 'type' ? icon(it.glyph) : '<i class="dot"></i>') + '</button>' +
      (kind === 'level' ? '<span class="rank mono" title="Rank">' + (i + 1) + '</span>' : '') +
      '<label class="sr" for="st-name-' + it.id + '">Name</label><input type="text" id="st-name-' + it.id + '" class="st-name" value="' + esc(it.name) + '" data-rename="' + key + '" maxlength="24">' +
      (isDefault ? '<span class="badge">Default</span>' : '') +
      '<span class="st-used mono muted" title="Tasks using this">' + used + '</span>' +
      '<div class="st-acts">' +
      '<button type="button" class="icon-btn sm" data-move="' + key + '" data-dir="-1" aria-label="Move up"' + (i === 0 ? ' disabled' : '') + '>' + icon('up') + '</button>' +
      '<button type="button" class="icon-btn sm" data-move="' + key + '" data-dir="1" aria-label="Move down"' + (i === n - 1 ? ' disabled' : '') + '>' + icon('down') + '</button>' +
      '<button type="button" class="icon-btn sm" data-del="' + key + '" aria-label="Delete"' + (kind === 'level' && n <= 1 ? ' disabled' : '') + '>' + icon('trash') + '</button></div>' +
      (confirming ? '<div class="st-confirm">' + (used ? used + ' task' + (used === 1 ? '' : 's') + (kind === 'type' ? ' will have no type.' : ' will move to “' + esc(fallbackLevel(it.id).name) + '”.') : 'No tasks use this.') +
        ' <button type="button" class="btn sm danger-solid" data-delyes="' + key + '">Delete ' + esc(it.name) + '</button><button type="button" class="btn sm ghost" data-delno>Cancel</button></div>' : '') +
      (ui.pop === key ? '<div class="pop">' +
        '<div class="swatches">' + SWATCHES.map((c) => '<button type="button" class="sw' + (c.toLowerCase() === it.color.toLowerCase() ? ' on' : '') + '" style="--c:' + c + '" data-color="' + key + '" data-val="' + c + '" aria-label="Color ' + c + '"></button>').join('') + '</div>' +
        (kind === 'type' ? '<div class="glyphs">' + C.GLYPHS.map((g) => '<button type="button" class="gl' + (g === it.glyph ? ' on' : '') + '" data-glyph="' + key + '" data-val="' + g + '" aria-label="Icon ' + g + '">' + icon(g) + '</button>').join('') + '</div>' : '') +
        '</div>' : '') +
      '</li>';
  }

  function fallbackLevel(excludeId) {
    const ls = S().state.levels.filter((l) => l.id !== excludeId);
    return ls.find((l) => l.id === S().state.prefs.defaultLevel) || ls[Math.floor(ls.length / 2)] || ls[0];
  }

  function listFor(kind) { return C.clone(kind === 'type' ? S().state.types : S().state.levels); }
  function save(kind, list) { ui.force = true; kind === 'type' ? S().setTypes(list) : S().setLevels(list); }
  function split(key) { const i = key.indexOf(':'); return [key.slice(0, i), key.slice(i + 1)]; }

  async function onClick(e) {
    const b = e.target.closest('button'); if (!b) { if (ui.pop && !e.target.closest('.pop')) { ui.pop = null; render(); } return; }
    const d = b.dataset;
    if (d.pop) { ui.pop = ui.pop === d.pop ? null : d.pop; return render(); }
    if (d.color || d.glyph) {
      const [kind, id] = split(d.color || d.glyph);
      const list = listFor(kind); const it = list.find((x) => x.id === id);
      if (d.color) it.color = d.val; else it.glyph = d.val;
      return save(kind, list);
    }
    if (d.move) {
      const [kind, id] = split(d.move);
      const list = listFor(kind); const i = list.findIndex((x) => x.id === id); const j = i + Number(d.dir);
      if (j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      return save(kind, list);
    }
    if (d.del) { ui.confirm = d.del; ui.pop = null; return render(); }
    if (b.hasAttribute('data-delno')) { ui.confirm = null; return render(); }
    if (d.delyes) {
      const [kind, id] = split(d.delyes);
      const list = listFor(kind).filter((x) => x.id !== id);
      if (kind === 'type') {
        S().state.tasks.filter((t) => t.typeId === id).forEach((t) => S().updateTask(t.id, { typeId: null }));
        if (S().state.prefs.defaultType === id) S().setPrefs({ defaultType: null });
      } else {
        const fb = fallbackLevel(id);
        S().state.tasks.filter((t) => t.levelId === id).forEach((t) => S().updateTask(t.id, { levelId: fb.id }));
        if (S().state.prefs.defaultLevel === id) S().setPrefs({ defaultLevel: fb.id });
      }
      ui.confirm = null;
      return save(kind, list);
    }
    if (d.add) {
      const kind = d.add, list = listFor(kind);
      const used = new Set(list.map((x) => x.color));
      const color = SWATCHES.find((c) => !used.has(c)) || SWATCHES[list.length % SWATCHES.length];
      const it = kind === 'type'
        ? { id: C.uid('ty'), name: 'New type', color, glyph: C.GLYPHS[list.length % C.GLYPHS.length] }
        : { id: C.uid('lv'), name: 'New level', color };
      list.push(it);
      save(kind, list);
      const inp = el.querySelector('#st-name-' + it.id); if (inp) { inp.focus(); inp.select(); }
      return;
    }
    if (d.seg) {
      const v = d.seg === 'weekStart' ? Number(d.val) : d.val;
      S().setPrefs({ [d.seg]: v });
      if (d.seg === 'theme') C.applyTheme();
      return;
    }
    const act = d.act;
    if (act === 'signout') return C.firebaseSync.signOut();
    if (act === 'retry') { const ok = await S().retrySync(); ui.force = true; render(); return C.toast(ok ? 'Reconnected. Sending your changes now.' : 'Still can’t connect. See the details under Your data.'); }
    if (act === 'export') return exportData();
    if (act === 'copy') return copyData();
    if (act === 'samples') { S().loadSamples(); return C.toast('Added example tasks. Clear them any time from the Tasks page.'); }
    if (act === 'clearDone') {
      const gone = S().clearCompleted();
      if (!gone.length) return C.toast('No completed tasks to delete.');
      return C.toast('Deleted ' + gone.length + ' completed task' + (gone.length === 1 ? '' : 's'), { action: 'Undo', onAction: () => gone.forEach((t) => S().restoreTask(t)) });
    }
    if (act === 'reset') { ui.reset = true; return render(); }
    if (act === 'resetNo') { ui.reset = false; return render(); }
    if (act === 'resetYes') { ui.reset = false; S().resetAll(); C.applyTheme(); return C.toast('Everything was reset. Types and levels are back to defaults.'); }
  }

  function onChange(e) {
    const t = e.target;
    if (t.dataset.rename) {
      const [kind, id] = split(t.dataset.rename);
      const v = t.value.trim();
      const list = listFor(kind); const it = list.find((x) => x.id === id);
      if (!v) { t.value = it.name; return; }
      if (it.name === v) return;
      it.name = v;
      return save(kind, list);
    }
    if (t.dataset.pref) { ui.force = true; return S().setPrefs({ [t.dataset.pref]: t.value || null }); }
    if (t.id === 'st-import' && t.files && t.files[0]) {
      const f = t.files[0];
      const r = new FileReader();
      r.onload = () => {
        try {
          const res = S().importJSON(String(r.result));
          ui.msg = 'Imported ' + res.total + ' tasks (' + res.added + ' new) from ' + f.name + '.';
          ui.force = true; render();
          C.toast('Import complete');
        } catch (err) {
          ui.msg = err instanceof SyntaxError ? f.name + ' is not valid JSON. Choose a backup exported from Cadence.' : err.message;
          ui.force = true; render();
        }
      };
      r.readAsText(f);
      t.value = '';
    }
  }

  async function exportData() {
    const json = S().exportJSON();
    const name = 'cadence-backup-' + C.D.todayKey() + '.json';
    const cl = window.claude;
    if (cl && cl.use) {
      const dl = await cl.use('downloads').catch(() => null);
      if (dl) {
        try { const r = await dl.save({ filename: name, data: json }); if (r && r.status === 'saved') C.toast('Backup saved as ' + name); return; }
        catch (err) { if (err && err.code === 'declined') return; }
      }
      return copyData('Downloads are not available here, so the backup was copied to your clipboard.');
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    C.toast('Backup saved as ' + name);
  }

  function copyData(msg) {
    const json = S().exportJSON();
    const fallback = () => {
      const ta = el.querySelector('#st-json'); ta.value = json; ta.classList.remove('sr'); ta.classList.add('json-out'); ta.removeAttribute('aria-hidden'); ta.focus(); ta.select();
      C.toast('Select all and copy the JSON shown below.');
    };
    try {
      navigator.clipboard.writeText(json).then(() => C.toast(typeof msg === 'string' ? msg : 'Copied ' + S().state.tasks.length + ' tasks as JSON'), fallback);
    } catch (err) { fallback(); }
  }
})();
