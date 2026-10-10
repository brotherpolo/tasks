/* Cadence — task editor (bottom sheet on phones, side panel on desktop) */
(function () {
  const C = window.Cadence;
  const { D, esc, icon } = C;
  let open = null;

  C.openEditor = function (idOrPreset) {
    const S = C.store;
    const existing = typeof idOrPreset === 'string' ? S.get(idOrPreset) : null;
    const draft = existing ? C.clone(existing) : Object.assign({
      title: '', notes: '', typeId: S.state.prefs.defaultType || null, levelId: S.state.prefs.defaultLevel || (S.state.levels[0] || {}).id,
      due: null, time: null, subtasks: [], repeat: 'none', done: false
    }, idOrPreset || {});
    if (open) open.close(true);

    const root = document.getElementById('overlay-root');
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = '<div class="sheet-backdrop" data-close></div>' +
      '<form class="sheet" role="dialog" aria-modal="true" aria-label="' + (existing ? 'Edit task' : 'New task') + '" novalidate>' +
      '<div class="sheet-grab" aria-hidden="true"></div>' +
      '<div class="sheet-head"><span class="eyebrow">' + (existing ? (existing.done ? 'Completed task' : 'Edit task') : 'New task') + '</span>' +
      '<button type="button" class="icon-btn" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="sheet-body"></div>' +
      '<div class="sheet-foot">' +
      (existing ? '<button type="button" class="btn ghost danger" data-act="delete">' + icon('trash') + '<span>Delete</span></button>' : '') +
      '<span class="spacer"></span>' +
      '<button type="button" class="btn ghost" data-close>Cancel</button>' +
      '<button type="submit" class="btn primary">' + (existing ? 'Save' : 'Add task') + '</button>' +
      '</div></form>';
    root.appendChild(wrap);
    const form = wrap.querySelector('form');
    const body = wrap.querySelector('.sheet-body');

    function render() {
      const types = S.state.types, levels = S.state.levels;
      const tk = D.todayKey();
      const quick = [['Today', tk], ['Tomorrow', D.addKey(tk, 1)], ['Next week', D.key(D.add(D.startOfWeek(D.today(), S.state.prefs.weekStart), 7))], ['No date', '']];
      const sub = draft.subtasks || [];
      body.innerHTML =
        '<label class="sr" for="ed-title">Title</label>' +
        '<div class="ed-title-row">' +
        (existing ? '<button type="button" class="check lg' + (draft.done ? ' on' : '') + '" data-act="done" aria-pressed="' + draft.done + '" aria-label="Mark complete" style="--lv:' + lvColor(draft.levelId) + '">' + icon('check') + '</button>' : '') +
        '<textarea id="ed-title" class="ed-title" rows="1" placeholder="What needs doing?" required>' + esc(draft.title) + '</textarea></div>' +

        '<div class="field"><span class="field-label">Importance</span><div class="seg" role="radiogroup">' +
        levels.map((l) => '<button type="button" role="radio" class="seg-btn' + (draft.levelId === l.id ? ' on' : '') + '" data-level="' + l.id + '" aria-checked="' + (draft.levelId === l.id) + '" style="--c:' + l.color + '"><i class="dot"></i>' + esc(l.name) + '</button>').join('') +
        '</div></div>' +

        '<div class="field"><span class="field-label">Type</span><div class="chips">' +
        '<button type="button" class="chip' + (!draft.typeId ? ' on' : '') + '" data-type="">None</button>' +
        types.map((t) => '<button type="button" class="chip' + (draft.typeId === t.id ? ' on' : '') + '" data-type="' + t.id + '" style="--c:' + t.color + '">' + icon(t.glyph) + esc(t.name) + '</button>').join('') +
        '</div></div>' +

        '<div class="field"><span class="field-label">When</span>' +
        '<div class="chips">' + quick.map(([lbl, k]) => '<button type="button" class="chip' + ((draft.due || '') === k ? ' on' : '') + '" data-due="' + k + '">' + lbl + '</button>').join('') + '</div>' +
        '<div class="row2"><label class="input-wrap"><span class="sr">Date</span>' + icon('calendar') + '<input id="ed-date" type="date" value="' + (draft.due || '') + '"></label>' +
        '<label class="input-wrap"><span class="sr">Time</span>' + icon('clock') + '<input id="ed-time" type="time" value="' + (draft.time || '') + '"></label></div>' +
        '<label class="input-wrap"><span class="sr">Repeat</span>' + icon('repeat') + '<select id="ed-repeat">' +
        C.REPEATS.map((r) => '<option value="' + r.id + '"' + (draft.repeat === r.id ? ' selected' : '') + '>' + r.label + '</option>').join('') + '</select></label>' +
        '</div>' +

        '<div class="field"><span class="field-label">Checklist <span class="muted mono">' + (sub.length ? sub.filter((x) => x.done).length + '/' + sub.length : '') + '</span></span>' +
        '<ul class="subs">' + sub.map((x, i) => '<li class="sub"><button type="button" class="check sm' + (x.done ? ' on' : '') + '" data-sub-toggle="' + i + '" aria-label="Toggle step">' + icon('check') + '</button>' +
          '<input id="ed-sub-' + x.id + '" class="sub-input' + (x.done ? ' done' : '') + '" value="' + esc(x.title) + '" data-sub-edit="' + i + '" aria-label="Step">' +
          '<button type="button" class="icon-btn sm" data-sub-del="' + i + '" aria-label="Remove step">' + icon('x') + '</button></li>').join('') +
        '<li class="sub add"><span class="sub-plus">' + icon('plus') + '</span><input id="ed-sub-new" class="sub-input" placeholder="Add a step, press Enter"></li></ul></div>' +

        '<div class="field"><label class="field-label" for="ed-notes">Notes</label><textarea id="ed-notes" rows="3" placeholder="Links, details, context…">' + esc(draft.notes || '') + '</textarea></div>';
      autoGrow(body.querySelector('#ed-title'));
    }
    function lvColor(id) { const l = S.levelById(id); return l ? l.color : 'var(--ink-3)'; }
    function autoGrow(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
    function sync() {
      draft.title = body.querySelector('#ed-title').value;
      draft.notes = body.querySelector('#ed-notes').value;
      draft.due = body.querySelector('#ed-date').value || null;
      draft.time = body.querySelector('#ed-time').value || null;
      draft.repeat = body.querySelector('#ed-repeat').value;
    }
    render();

    body.addEventListener('input', (e) => {
      if (e.target.id === 'ed-title') autoGrow(e.target);
      if (e.target.dataset.subEdit != null) draft.subtasks[+e.target.dataset.subEdit].title = e.target.value;
    });
    body.addEventListener('change', (e) => {
      if (e.target.id === 'ed-date' || e.target.id === 'ed-time') { sync(); render(); }
    });
    body.addEventListener('keydown', (e) => {
      if (e.target.id === 'ed-sub-new' && e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim(); if (!v) return;
        sync();
        draft.subtasks = (draft.subtasks || []).concat({ id: C.uid('s'), title: v, done: false });
        render();
        body.querySelector('#ed-sub-new').focus();
      }
      if (e.target.id === 'ed-title' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
    });
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button,[data-close]');
      if (!b) return;
      if (b.hasAttribute('data-close')) return close();
      if (b.dataset.level) { sync(); draft.levelId = b.dataset.level; render(); }
      else if (b.dataset.type != null) { sync(); draft.typeId = b.dataset.type || null; render(); }
      else if (b.dataset.due != null) { sync(); draft.due = b.dataset.due || null; if (!draft.due) draft.time = null; render(); }
      else if (b.dataset.subToggle != null) { sync(); const x = draft.subtasks[+b.dataset.subToggle]; x.done = !x.done; render(); }
      else if (b.dataset.subDel != null) { sync(); draft.subtasks.splice(+b.dataset.subDel, 1); render(); }
      else if (b.dataset.act === 'done') { sync(); draft.done = !draft.done; render(); }
      else if (b.dataset.act === 'delete') {
        const t = S.deleteTask(existing.id);
        close(true);
        C.toast('Deleted “' + t.title + '”', { action: 'Undo', onAction: () => S.restoreTask(t) });
      }
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sync();
      const title = draft.title.trim();
      if (!title) { body.querySelector('#ed-title').focus(); body.querySelector('#ed-title').classList.add('shake'); setTimeout(() => body.querySelector('#ed-title') && body.querySelector('#ed-title').classList.remove('shake'), 400); return; }
      draft.title = title;
      draft.subtasks = (draft.subtasks || []).filter((x) => x.title.trim());
      const pendingSub = body.querySelector('#ed-sub-new').value.trim();
      if (pendingSub) draft.subtasks.push({ id: C.uid('s'), title: pendingSub, done: false });
      if (existing) {
        const wasDone = existing.done;
        const patch = { title: draft.title, notes: draft.notes, typeId: draft.typeId, levelId: draft.levelId, due: draft.due, time: draft.due ? draft.time : null, repeat: draft.repeat, subtasks: draft.subtasks };
        S.updateTask(existing.id, patch);
        if (draft.done !== wasDone) C.completeTask(existing.id);
        close(true);
      } else {
        const t = S.addTask({ title: draft.title, notes: draft.notes, typeId: draft.typeId, levelId: draft.levelId, due: draft.due, time: draft.due ? draft.time : null, repeat: draft.repeat, subtasks: draft.subtasks });
        close(true);
        C.toast('Added “' + t.title + '”' + (t.due ? ' · ' + C.relDate(t.due) : ''));
      }
    });
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); form.requestSubmit(); }
    };
    document.addEventListener('keydown', onKey, true);

    // drag-down to dismiss on phones
    const grab = wrap.querySelector('.sheet-grab');
    let y0 = null;
    grab.addEventListener('pointerdown', (e) => { y0 = e.clientY; grab.setPointerCapture(e.pointerId); });
    grab.addEventListener('pointermove', (e) => { if (y0 != null) form.style.transform = 'translateY(' + Math.max(0, e.clientY - y0) + 'px)'; });
    grab.addEventListener('pointerup', (e) => { const dy = e.clientY - y0; y0 = null; form.style.transform = ''; if (dy > 90) close(); });

    const prevFocus = document.activeElement;
    requestAnimationFrame(() => {
      wrap.classList.add('in');
      const ti = body.querySelector('#ed-title');
      if (!existing || window.matchMedia('(pointer:fine)').matches) { ti.focus(); ti.setSelectionRange(ti.value.length, ti.value.length); }
    });
    document.documentElement.classList.add('sheet-open');

    function close(immediate) {
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('sheet-open');
      wrap.classList.remove('in');
      setTimeout(() => wrap.remove(), immediate ? 0 : 220);
      if (prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) { /* gone */ }
      open = null;
    }
    open = { close };
  };
})();
