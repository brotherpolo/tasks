/* Cadence — state store.
   Always caches to localStorage. When opened as a claude.ai artifact with the
   `db` capability, tasks and settings sync to the viewer's private space
   (data/users/<id>/…) so they follow the person across devices. */
(function () {
  const C = window.Cadence;
  const { D } = C;
  const LS_KEY = 'cadence.v1';

  const DEFAULT_TYPES = [
    { id: 'ty-work', name: 'Work', color: '#3B6FE0', glyph: 'briefcase' },
    { id: 'ty-personal', name: 'Personal', color: '#C2410C', glyph: 'home' },
    { id: 'ty-errand', name: 'Errand', color: '#0E8F7E', glyph: 'cart' },
    { id: 'ty-health', name: 'Health', color: '#D23F6E', glyph: 'heart' },
    { id: 'ty-learning', name: 'Learning', color: '#8A55D6', glyph: 'book' }
  ];
  const DEFAULT_LEVELS = [
    { id: 'lv-critical', name: 'Critical', color: '#E5383B' },
    { id: 'lv-high', name: 'High', color: '#F08A24' },
    { id: 'lv-normal', name: 'Normal', color: '#3B82C4' },
    { id: 'lv-low', name: 'Low', color: '#8C94A6' }
  ];
  const DEFAULT_PREFS = {
    theme: 'system', weekStart: 1, group: 'due', sort: 'smart', showDone: false,
    listMode: 'agenda', calMode: 'month', defaultLevel: 'lv-normal', defaultType: null
  };

  const state = {
    tasks: [], types: [], levels: [], prefs: { ...DEFAULT_PREFS },
    mode: 'local', // 'local' | 'sync'
    ready: false
  };
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => { try { f(state); } catch (e) { console.error(e); } });

  /* ---------- local cache ---------- */
  function readLocal() {
    try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  const writeLocal = C.debounce(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ owner: state.owner || null, tasks: state.tasks, types: state.types, levels: state.levels, prefs: state.prefs }));
    } catch (e) { /* storage blocked: in-memory only */ }
  }, 120);

  /* ---------- remote sync (claude.ai db capability) ---------- */
  let remote = null; // { col }
  const queues = {};
  const settingsBody = () => ({ kind: 'settings', types: state.types, levels: state.levels, defaultLevel: state.prefs.defaultLevel, defaultType: state.prefs.defaultType });

  function queueWrite(id) {
    if (!remote) return;
    const q = queues[id] || (queues[id] = { busy: false, dirty: false });
    q.dirty = true;
    if (!q.busy) pump(id, q);
  }
  async function pump(id, q) {
    q.busy = true;
    while (q.dirty && remote) {
      q.dirty = false;
      const body = id === 'settings' ? settingsBody() : state.tasks.find((t) => t.id === id);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const ref = remote.col.doc(id);
          if (body) await ref.set(C.clone(body)); else await ref.delete();
          break;
        } catch (e) {
          const code = e && e.code;
          if (code === 'unavailable' && attempt === 0) { await new Promise((r) => setTimeout(r, 600 + Math.random() * 900)); continue; }
          if (code === 'quota_exceeded') C.toast && C.toast('Storage is full. Delete some completed tasks to keep syncing.');
          else if (code === 'permission-denied' || code === 'unauthenticated') { C.toast && C.toast('Sync was refused by the server rules. Changes are kept on this device.'); goLocal(); }
          else if (code === 'invalid_argument' || code === 'invalid-argument' || code === 'revoked' || code === 'not_granted' || code === 'capability_disabled') goLocal();
          break;
        }
      }
    }
    q.busy = false;
  }
  const pending = (id) => queues[id] && (queues[id].busy || queues[id].dirty);

  function goLocal() {
    remote = null;
    state.mode = 'local';
    emit();
  }

  function applySnapshot(snap) {
    const tasks = [];
    const seen = new Set();
    snap.docs.forEach((d) => {
      const body = d.data();
      if (!body) return;
      if (d.id === 'settings') {
        if (!pending('settings')) {
          if (Array.isArray(body.types)) state.types = C.clone(body.types);
          if (Array.isArray(body.levels) && body.levels.length) state.levels = C.clone(body.levels);
          if (body.defaultLevel) state.prefs.defaultLevel = body.defaultLevel;
          if ('defaultType' in body) state.prefs.defaultType = body.defaultType;
        }
        return;
      }
      seen.add(d.id);
      if (pending(d.id)) { const local = state.tasks.find((t) => t.id === d.id); if (local) tasks.push(local); return; }
      tasks.push(C.clone(body));
    });
    // keep local tasks whose create hasn't landed yet
    state.tasks.forEach((t) => { if (!seen.has(t.id) && pending(t.id)) tasks.push(t); });
    state.tasks = tasks;
    writeLocal();
    emit();
  }

  function pushAll() {
    queueWrite('settings');
    state.tasks.forEach((t) => queueWrite(t.id));
  }

  /* A provider resolves { col, uid, label } or null. Both backends expose the same
     collection shape: doc(id).set/delete and onSnapshot(snap => snap.docs / empty / metadata). */
  async function provider() {
    // 1) Firebase (self-hosted, signed-in users) — see firebase-config.js
    if (C.firebaseSync && C.firebaseSync.enabled) return C.firebaseSync.collection();
    // 2) claude.ai artifact db capability
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') return null;
    const [db, user] = await Promise.all([cl.use('db'), cl.use('user')]);
    if (!db || !user) return null;
    const uid = await user.id();
    if (!uid) return null;
    return { col: db.collection('data/users/' + uid), uid, label: 'account' };
  }

  /** Resolves { status: 'remote-empty' | 'remote-data', uid } or null (no sync available) */
  async function connect() {
    let p = null;
    try { p = await provider(); } catch (e) { console.warn('Sync unavailable:', e); C.toast && C.toast(e.message || 'Sync is unavailable. Working on this device only.'); }
    if (!p) return null;
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      setTimeout(() => done(null), 12000);
      let first = true;
      const listen = p.listen || ((next, err) => p.col.onSnapshot(next, err));
      listen((snap) => {
        if (first) {
          if (snap.metadata && snap.metadata.fromCache) return; // wait for server truth
          first = false;
          remote = { col: p.col };
          state.mode = 'sync';
          state.syncLabel = p.label;
          state.owner = p.uid;
          if (snap.empty) return done({ status: 'remote-empty', uid: p.uid });
          applySnapshot(snap);
          return done({ status: 'remote-data', uid: p.uid });
        }
        applySnapshot(snap);
      }, (err) => { console.warn('Sync stopped:', err); if (first) done(null); goLocal(); });
    });
  }

  /* ---------- sample data (clearly marked as examples) ---------- */
  function sampleTasks() {
    const k = (n) => D.key(D.add(D.today(), n));
    const now = Date.now();
    const mk = (title, o) => Object.assign({
      id: C.uid('t'), title, notes: '', typeId: null, levelId: 'lv-normal', due: null, time: null,
      done: false, doneAt: null, createdAt: now, updatedAt: now, subtasks: [], repeat: 'none', sample: true
    }, o);
    const st = (arr) => arr.map(([title, done]) => ({ id: C.uid('s'), title, done: !!done }));
    return [
      mk('Send Q4 roadmap draft to the team', { typeId: 'ty-work', levelId: 'lv-critical', due: k(0), time: '11:00', subtasks: st([['Outline themes', 1], ['Add estimates', 1], ['Review with design', 0]]) }),
      mk('Renew car registration', { typeId: 'ty-errand', levelId: 'lv-high', due: k(-2) }),
      mk('Pick up dry cleaning', { typeId: 'ty-errand', levelId: 'lv-low', due: k(0), time: '17:30' }),
      mk('30-minute run', { typeId: 'ty-health', levelId: 'lv-normal', due: k(1), time: '07:00', repeat: 'weekdays' }),
      mk('Book flights for Thanksgiving', { typeId: 'ty-personal', levelId: 'lv-high', due: k(2), notes: 'Check fares from both airports before Tuesday.' }),
      mk('1:1 prep with Priya', { typeId: 'ty-work', levelId: 'lv-normal', due: k(3), time: '09:30', repeat: 'weekly' }),
      mk('Finish chapter 4 of the TypeScript course', { typeId: 'ty-learning', levelId: 'lv-normal', due: k(4) }),
      mk('Dentist cleaning', { typeId: 'ty-health', levelId: 'lv-high', due: k(6), time: '14:00' }),
      mk('Quarterly expense report', { typeId: 'ty-work', levelId: 'lv-high', due: k(9), subtasks: st([['Export card statements'], ['Match receipts'], ['Submit in portal']]) }),
      mk('Plan weekend hike', { typeId: 'ty-personal', levelId: 'lv-low', due: k(13) }),
      mk('Read “Designing Data-Intensive Applications”', { typeId: 'ty-learning', levelId: 'lv-low' }),
      mk('Clean out the garage', { typeId: 'ty-personal', levelId: 'lv-normal' }),
      mk('Update team wiki onboarding page', { typeId: 'ty-work', levelId: 'lv-low', due: k(-1), done: true, doneAt: now - 3600e3 })
    ];
  }

  /* ---------- public API ---------- */
  const S = {
    state,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    emit,

    async init() {
      const local = readLocal();
      if (local) {
        state.tasks = local.tasks || [];
        state.types = local.types || C.clone(DEFAULT_TYPES);
        state.levels = (local.levels && local.levels.length) ? local.levels : C.clone(DEFAULT_LEVELS);
        state.prefs = { ...DEFAULT_PREFS, ...(local.prefs || {}) };
        state.ready = true;
        emit();
      }
      const res = await connect();
      const status = res && res.status;
      // never push one person's cached tasks into a different signed-in account
      const foreign = local && local.owner && res && local.owner !== res.uid;
      if ((!local || foreign) && status !== 'remote-data') {
        state.types = C.clone(DEFAULT_TYPES);
        state.levels = C.clone(DEFAULT_LEVELS);
        state.tasks = sampleTasks();
      }
      if (status === 'remote-empty') pushAll();
      state.ready = true;
      writeLocal();
      emit();
    },

    typeById(id) { return state.types.find((t) => t.id === id) || null; },
    levelById(id) { return state.levels.find((l) => l.id === id) || null; },
    levelRank(id) { const i = state.levels.findIndex((l) => l.id === id); return i < 0 ? state.levels.length : i; },
    get(id) { return state.tasks.find((t) => t.id === id) || null; },

    addTask(partial) {
      const now = Date.now();
      const t = Object.assign({
        id: C.uid('t'), title: 'Untitled task', notes: '', typeId: state.prefs.defaultType || null,
        levelId: state.prefs.defaultLevel || (state.levels[0] && state.levels[0].id), due: null, time: null,
        done: false, doneAt: null, createdAt: now, updatedAt: now, subtasks: [], repeat: 'none'
      }, partial);
      state.tasks.push(t);
      commit(t.id);
      return t;
    },
    updateTask(id, patch) {
      const t = S.get(id); if (!t) return null;
      Object.assign(t, patch, { updatedAt: Date.now() });
      commit(id);
      return t;
    },
    deleteTask(id) {
      const i = state.tasks.findIndex((t) => t.id === id);
      if (i < 0) return null;
      const [t] = state.tasks.splice(i, 1);
      commit(id);
      return t;
    },
    restoreTask(t) { if (!S.get(t.id)) { state.tasks.push(t); commit(t.id); } },

    /** Toggle completion; repeating tasks spawn their next occurrence. Returns {task, spawned} */
    toggleDone(id) {
      const t = S.get(id); if (!t) return {};
      const done = !t.done;
      let spawned = null;
      S.updateTask(id, { done, doneAt: done ? Date.now() : null });
      if (done && t.repeat && t.repeat !== 'none' && !t.spawnedNext) {
        const next = C.clone(t);
        Object.assign(next, { id: C.uid('t'), done: false, doneAt: null, createdAt: Date.now(), due: C.nextDue(t.due, t.repeat) });
        next.subtasks = (next.subtasks || []).map((s) => ({ ...s, done: false }));
        delete next.spawnedNext;
        spawned = S.addTask(next);
        S.updateTask(id, { spawnedNext: spawned.id });
      } else if (!done && t.spawnedNext) {
        const sp = S.get(t.spawnedNext);
        if (sp && !sp.done) S.deleteTask(sp.id);
        S.updateTask(id, { spawnedNext: null });
      }
      return { task: t, spawned };
    },

    setTypes(types) { state.types = types; commit('settings'); },
    setLevels(levels) { state.levels = levels; commit('settings'); },
    setPrefs(patch) {
      const syncKeys = ['defaultLevel', 'defaultType'];
      Object.assign(state.prefs, patch);
      if (Object.keys(patch).some((k) => syncKeys.includes(k))) commit('settings'); else { writeLocal(); emit(); }
    },

    clearCompleted() {
      const gone = state.tasks.filter((t) => t.done);
      gone.forEach((t) => S.deleteTask(t.id));
      return gone;
    },
    clearSamples() {
      const gone = state.tasks.filter((t) => t.sample);
      gone.forEach((t) => S.deleteTask(t.id));
      return gone.length;
    },
    keepSamples() { state.tasks.filter((t) => t.sample).forEach((t) => S.updateTask(t.id, { sample: false })); },
    loadSamples() { sampleTasks().forEach((t) => { state.tasks.push(t); commit(t.id, true); }); emit(); },

    exportJSON() {
      return JSON.stringify({ app: 'cadence', version: 1, exportedAt: new Date().toISOString(), tasks: state.tasks, types: state.types, levels: state.levels }, null, 2);
    },
    importJSON(text) {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.tasks)) throw new Error('That file has no "tasks" list. Choose a file exported from Cadence.');
      if (Array.isArray(data.types)) state.types = data.types;
      if (Array.isArray(data.levels) && data.levels.length) state.levels = data.levels;
      commit('settings', true);
      let added = 0;
      data.tasks.forEach((t) => {
        if (!t || !t.id || !t.title) return;
        const ex = S.get(t.id);
        if (ex) Object.assign(ex, t); else { state.tasks.push(t); added++; }
        commit(t.id, true);
      });
      emit();
      return { added, total: data.tasks.length };
    },
    resetAll() {
      const ids = state.tasks.map((t) => t.id);
      state.tasks = [];
      ids.forEach((id) => commit(id, true));
      state.types = C.clone(DEFAULT_TYPES);
      state.levels = C.clone(DEFAULT_LEVELS);
      state.prefs = { ...DEFAULT_PREFS, theme: state.prefs.theme };
      commit('settings');
    }
  };

  function commit(id, silent) {
    writeLocal();
    queueWrite(id);
    if (!silent) emit();
  }

  C.store = S;
})();
