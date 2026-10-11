/* Cadence — command palette (⌘K / Ctrl+K) */
(function () {
  const C = window.Cadence;
  const { esc, icon } = C;
  let current = null;

  C.openPalette = function () {
    if (current) return current.close();
    const S = C.store;
    const wrap = document.createElement('div');
    wrap.className = 'pal-wrap';
    wrap.innerHTML = '<div class="sheet-backdrop" data-close></div><div class="pal" role="dialog" aria-modal="true" aria-label="Command menu">' +
      '<div class="pal-input">' + icon('search') + '<input id="pal-q" placeholder="Search tasks or type a command…" autocomplete="off" spellcheck="false"><kbd>esc</kbd></div>' +
      '<div class="pal-list" role="listbox" id="pal-list"></div>' +
      '<div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span class="muted">Tip: start a line with “+” to add it as a task</span></div></div>';
    document.getElementById('overlay-root').appendChild(wrap);
    const q = wrap.querySelector('#pal-q');
    const list = wrap.querySelector('#pal-list');
    let items = [], sel = 0;

    const actions = [
      { label: 'New task', hint: 'N', ic: 'plus', run: () => C.openEditor() },
      { label: 'Go to Tasks', hint: '1', ic: 'list', run: () => C.go('list') },
      { label: 'Go to Calendar', hint: '2', ic: 'calendar', run: () => C.go('calendar') },
      { label: 'Go to Insights', hint: '3', ic: 'chart', run: () => C.go('insights') },
      { label: 'Go to Settings', hint: '4', ic: 'settings', run: () => C.go('settings') },
      { label: 'Toggle dark mode', hint: 'D', ic: 'moon', run: () => C.cycleTheme() },
      { label: 'Show completed tasks', ic: 'check', run: () => { S.setPrefs({ showDone: !S.state.prefs.showDone }); C.go('list'); } },
      { label: 'Switch list to table view', ic: 'table', run: () => { S.setPrefs({ listMode: S.state.prefs.listMode === 'table' ? 'agenda' : 'table' }); C.go('list'); } }
    ];

    function build() {
      const v = q.value.trim();
      const lv = v.toLowerCase();
      items = [];
      if (v.startsWith('+') && v.length > 1) {
        const p = C.parseQuick(v.slice(1), S.state.types, S.state.levels, S.state.prefs.weekStart);
        items.push({ label: 'Add “' + p.title + '”', sub: p.tokens.map((t) => t.label).join(' · '), ic: 'plus', run: () => { const t = S.addTask(C.fromParse(p)); C.toast('Added “' + t.title + '”'); } });
      }
      actions.filter((a) => !lv || a.label.toLowerCase().includes(lv)).forEach((a) => items.push(a));
      const tasks = S.state.tasks
        .filter((t) => !lv || t.title.toLowerCase().includes(lv) || (t.notes || '').toLowerCase().includes(lv))
        .sort((a, b) => (a.done - b.done) || ((a.due || '9') < (b.due || '9') ? -1 : 1))
        .slice(0, lv ? 12 : 6);
      tasks.forEach((t) => {
        const ty = S.typeOf(t);
        items.push({ label: t.title, sub: [C.relDate(t.due), ty && ty.name, S.isAssignedToMe(t) && 'From ' + C.firstName(t.ownerName, t.ownerEmail), t.done && 'Done'].filter(Boolean).join(' · '), ic: ty ? ty.glyph : 'inbox', color: ty && ty.color, task: true, run: () => C.openEditor(t.id) });
      });
      sel = Math.min(sel, Math.max(0, items.length - 1));
      list.innerHTML = items.length ? items.map((it, i) =>
        (i === 0 || (it.task && !items[i - 1].task) ? '<div class="pal-group">' + (it.task ? 'Tasks' : 'Actions') + '</div>' : '') +
        '<button type="button" role="option" class="pal-item' + (i === sel ? ' on' : '') + '" data-i="' + i + '" aria-selected="' + (i === sel) + '"' + (it.color ? ' style="--c:' + it.color + '"' : '') + '>' +
        '<span class="pal-ic' + (it.color ? ' tinted' : '') + '">' + icon(it.ic) + '</span><span class="pal-text"><span class="pal-label' + (it.task && S.get && /Done$/.test(it.sub || '') ? ' struck' : '') + '">' + esc(it.label) + '</span>' +
        (it.sub ? '<span class="pal-sub">' + esc(it.sub) + '</span>' : '') + '</span>' +
        (it.hint ? '<kbd>' + it.hint + '</kbd>' : '') + '</button>').join('') : '<div class="pal-empty">Nothing matches “' + esc(v) + '”. Start with “+” to add it as a task.</div>';
      const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    }
    function run(i) { const it = items[i]; if (!it) return; close(); it.run(); }
    q.addEventListener('input', () => { sel = 0; build(); });
    q.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % items.length; build(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + items.length) % items.length; build(); }
      else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return close();
      const b = e.target.closest('.pal-item'); if (b) run(+b.dataset.i);
    });
    build();
    requestAnimationFrame(() => { wrap.classList.add('in'); q.focus(); });
    function close() { wrap.classList.remove('in'); setTimeout(() => wrap.remove(), 160); current = null; }
    current = { close };
  };
})();
