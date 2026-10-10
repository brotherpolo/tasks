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
    sync: { status: 'local', provider: null, lastAt: null, pending: 0, error: null, cloudCount: null },
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

  /* ---------- remote sync (Firebase or claude.ai db) ----------
     state.sync = { status, provider, lastAt, pending, error }
       status: 'local' | 'connecting' | 'synced' | 'saving' | 'offline' | 'error'          */
  let remote = null; // { col }
  let conn = null;   // the provider result, kept so Retry can re-listen
  let unlisten = null;
  const queues = {};
  const failed = new Set();
  const settingsBody = () => ({ kind: 'settings', types: state.types, levels: state.levels, defaultLevel: state.prefs.defaultLevel, defaultType: state.prefs.defaultType });

  function setSync(patch) {
    Object.assign(state.sync, patch);
    state.mode = remote ? 'sync' : 'local';
    emit();
  }
  const pendingCount = () => Object.values(queues).filter((q) => q.busy || q.dirty).length;
  function refreshStatus() {
    if (!remote) return;
    if (state.sync.status === 'error' && failed.size) return; // keep the error visible until Retry
    const n = pendingCount();
    if (!navigator.onLine) return setSync({ status: 'offline', pending: n });
    if (n) return setSync({ status: 'saving', pending: n });
    setSync({ status: 'synced', pending: 0, lastAt: Date.now(), error: null });
  }

  /** Turn an SDK error into words a person can act on */
  function explain(err, during) {
    const code = (err && err.code) || 'unknown';
    const raw = (err && err.message) || String(err || '');
    const fb = state.sync.provider === 'firebase';
    const m = {
      'permission-denied': ['The database refused ' + (during === 'write' ? 'to save a change' : 'access'),
        fb ? 'Deploy the security rules (firebase deploy --only firestore:rules) and check they appear under Firestore Database → Rules in the console. If the message mentions "API has not been used", enable the Cloud Firestore API for this project.' : 'Your access to this page changed.'],
      'not-found': ['No Firestore database found', 'In the Firebase console open Firestore Database → Create database, then press Retry.'],
      'failed-precondition': ['Firestore isn’t ready', 'Create the Firestore database in the Firebase console (Firestore Database → Create database), then press Retry.'],
      'unauthenticated': ['You’re signed out', 'Reload the page and sign in again.'],
      'unavailable': ['Can’t reach the database', 'Check your connection. Changes stay on this device and are sent when you’re back online. Ad blockers and privacy extensions sometimes block firestore.googleapis.com.'],
      'resource-exhausted': ['Database quota reached', 'Your Firebase project hit a usage limit. Check Usage in the Firebase console.'],
      'invalid-argument': ['A change was rejected', 'One task has data the database won’t accept. Export a backup and send it to whoever maintains the app.'],
      'timeout': ['No answer from the database', 'Nothing came back after 12 seconds. Make sure the Firestore database exists and that an ad blocker isn’t blocking firestore.googleapis.com, then press Retry.'],
      'quota_exceeded': ['Storage is full', 'Delete some completed tasks to keep syncing.'],
      'sdk': ['Couldn’t load sync', raw]
    }[code] || ['Sync stopped', raw || 'Unknown error'];
    return { code, title: m[0], hint: m[1], raw, at: Date.now() };
  }

  function queueWrite(id) {
    if (!remote) return;
    const q = queues[id] || (queues[id] = { busy: false, dirty: false });
    q.dirty = true;
    if (!q.busy) pump(id, q);
  }
  async function pump(id, q) {
    q.busy = true;
    refreshStatus();
    while (q.dirty && remote) {
      q.dirty = false;
      const body = id === 'settings' ? settingsBody() : state.tasks.find((t) => t.id === id);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const ref = remote.col.doc(id);
          if (body) await ref.set(C.clone(body)); else await ref.delete();
          failed.delete(id);
          break;
        } catch (e) {
          const code = e && e.code;
          if (code === 'unavailable' && attempt === 0) { await new Promise((r) => setTimeout(r, 600 + Math.random() * 900)); continue; }
          console.warn('Sync write failed for', id, e);
          failed.add(id);
          if (code === 'revoked' || code === 'not_granted' || code === 'capability_disabled') { goLocal(explain(e, 'write')); }
          else setSync({ status: 'error', error: Object.assign(explain(e, 'write'), { doc: id }) });
          break;
        }
      }
    }
    q.busy = false;
    refreshStatus();
  }
  const pending = (id) => queues[id] && (queues[id].busy || queues[id].dirty);

  function goLocal(error) {
    remote = null;
    if (unlisten) { try { unlisten(); } catch (e) { /* already closed */ } unlisten = null; }
    setSync({ status: error ? 'error' : 'local', error: error || null, pending: 0 });
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
      if (pending(d.id) || failed.has(d.id)) { const local = state.tasks.find((t) => t.id === d.id); if (local) tasks.push(local); return; }
      tasks.push(C.clone(body));
    });
    // keep local tasks whose create hasn't landed yet (or was refused, so nothing is lost)
    state.tasks.forEach((t) => { if (!seen.has(t.id) && (pending(t.id) || failed.has(t.id))) tasks.push(t); });
    state.tasks = tasks;
    if (snap.metadata && !snap.metadata.fromCache) {
      state.sync.lastAt = Date.now();
      state.sync.cloudCount = snap.docs.filter((d) => d.id !== 'settings').length;
    }
    writeLocal();
    refreshStatus();
    emit();
  }

  function pushAll() {
    queueWrite('settings');
    state.tasks.forEach((t) => queueWrite(t.id));
  }

  /* A provider resolves { col, uid, label, listen? } or null. Both backends expose the same
     collection shape: doc(id).set/delete and onSnapshot(snap => snap.docs / empty / metadata). */
  async function provider() {
    if (conn) return conn;
    // 1) Firebase (self-hosted, signed-in users) — see firebase-config.js
    if (C.firebaseSync && C.firebaseSync.enabled) {
      setSync({ status: 'connecting', provider: 'firebase' });
      return (conn = await C.firebaseSync.collection());
    }
    // 2) claude.ai artifact db capability
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') return null;
    setSync({ status: 'connecting', provider: 'claude' });
    const [db, user] = await Promise.all([cl.use('db'), cl.use('user')]);
    if (!db || !user) { setSync({ status: 'local', provider: null }); return null; }
    const uid = await user.id();
    if (!uid) { setSync({ status: 'local', provider: null }); return null; }
    return (conn = { col: db.collection('data/users/' + uid), uid, label: 'claude' });
  }

  /** Resolves { status: 'remote-empty' | 'remote-data', uid } or null (no sync available) */
  async function connect() {
    let p = null;
    try { p = await provider(); }
    catch (e) { console.warn('Sync unavailable:', e); goLocal(explain({ code: 'sdk', message: e.message }, 'connect')); return null; }
    if (!p) return null;
    setSync({ status: 'connecting', error: null });
    return new Promise((resolve) => {
      let settled = false;
      const done = (v) => { if (!settled) { settled = true; resolve(v); } };
      const timer = setTimeout(() => { if (first) { setSync({ status: 'error', error: explain({ code: 'timeout' }) }); done(null); } }, 12000);
      let first = true;
      const listen = p.listen || ((next, err) => p.col.onSnapshot(next, err));
      if (unlisten) { try { unlisten(); } catch (e) { /* closed */ } }
      unlisten = listen((snap) => {
        if (first) {
          if (snap.metadata && snap.metadata.fromCache && navigator.onLine) return; // wait for server truth
          first = false;
          clearTimeout(timer);
          remote = { col: p.col };
          state.syncLabel = p.label;
          state.owner = p.uid;
          const wasLate = settled; // answered after the timeout: push what we have
          if (snap.empty) { state.sync.cloudCount = 0; if (wasLate) pushAll(); refreshStatus(); return done({ status: 'remote-empty', uid: p.uid }); }
          applySnapshot(snap);
          if (wasLate) pushAll();
          return done({ status: 'remote-data', uid: p.uid });
        }
        applySnapshot(snap);
      }, (err) => {
        console.warn('Sync stopped:', err);
        clearTimeout(timer);
        goLocal(explain(err, 'read'));
        done(null);
      });
    });
  }

  window.addEventListener('online', () => { if (remote) { failed.forEach(queueWrite); refreshStatus(); } });
  window.addEventListener('offline', () => refreshStatus());

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

    /** Retry: reconnect if the listener died, then resend everything (writes are idempotent) */
    async retrySync() {
      failed.clear();
      setSync({ status: 'connecting', error: null });
      if (!remote) {
        const res = await connect();
        if (!res) return false;
      }
      pushAll();
      refreshStatus();
      return true;
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
