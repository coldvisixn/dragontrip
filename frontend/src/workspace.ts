import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { api } from './api';
import { t } from './i18n';

type Cell = { revision: number; value: { data: unknown } | null; closed: boolean };
type Entry = {
  cell: Cell;
  local: boolean;
  saved: number;
  error: string;
  edited: boolean;
  timer?: ReturnType<typeof setTimeout>;
};
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const loading = new Map<string, Promise<boolean>>();
let clock = Date.now();
let version = 0;
const emit = () => {
  version++;
  listeners.forEach((fn) => fn());
};
const storageKey = (pid: string, key: string) => `dragontrip.workspace:${pid}:${key}`;
export function readLocal(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
export function writeLocal(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
function entry(pid: string, key: string): Entry {
  const id = storageKey(pid, key);
  let result = entries.get(id);
  if (!result) {
    let cell: Cell = { revision: 0, value: null, closed: false };
    try {
      const stored = JSON.parse(readLocal(id) || 'null');
      if (
        stored &&
        typeof stored.revision === 'number' &&
        typeof stored.closed === 'boolean' &&
        (stored.value === null || typeof stored.value === 'object')
      )
        cell = stored;
    } catch {
      /* Retain a usable workspace if storage was damaged. */
    }
    result = { cell, local: Boolean(cell.revision), saved: 0, error: '', edited: false };
    entries.set(id, result);
  }
  return result;
}
async function persist(pid: string, key: string, state: Entry) {
  const cell = state.cell;
  if (pid === 'global') return;
  try {
    const received = await api<Cell>(`/projects/${pid}/workspace/${key}`, 'PUT', cell);
    if (received?.closed && !state.cell.closed) {
      if (state.cell.value?.data)
        putWorkspace(pid, 'draft:' + crypto.randomUUID(), state.cell.value.data);
      state.cell = received;
      state.local = writeLocal(storageKey(pid, key), JSON.stringify(received));
    }
    if (
      received &&
      typeof received.revision === 'number' &&
      !received.closed &&
      (received.revision !== cell.revision ||
        JSON.stringify(received.value) !== JSON.stringify(cell.value))
    ) {
      if ((key.startsWith('draft:') || key === 'methodology_work') && state.cell.value?.data)
        putWorkspace(pid, 'draft:' + crypto.randomUUID(), state.cell.value.data);
      state.error =
        'A newer workspace copy exists. Your text is retained; retry sync or recover the retained copy.';
      emit();
      return;
    }
    state.saved = Math.max(state.saved, cell.revision);
    state.error = '';
  } catch (error) {
    state.error = (error as Error).message;
  }
  emit();
}
function recoverLegacyLocal(pid: string) {
  try {
    const prefix = `dragontrip.draft:${pid}:`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)!;
      if (!key.startsWith(prefix)) continue;
      const match = /^(note|finding|path):(new|[a-f0-9-]{36})$/.exec(key.slice(prefix.length));
      if (!match) continue;
      const old = JSON.parse(localStorage.getItem(key) || 'null');
      if (!old?.value || !old.revision) continue;
      const [, kind, id] = match;
      const draftId = `legacy-${kind}-${id}`,
        draftKey = 'draft:' + draftId;
      const current = entry(pid, draftKey);
      const timestamp = Number(old.revision.slice(0, 13));
      if (current.cell.closed || current.cell.revision >= timestamp) continue;
      putWorkspace(pid, draftKey, {
        ...old.value,
        kind,
        record_id: id === 'new' ? undefined : id,
        request_id: draftId,
        expected_updated: old.value.expectedUpdated,
        changed: new Date(timestamp).toISOString(),
      });
      const pageKey = 'knowledge:' + kind;
      if (!entry(pid, pageKey).cell.revision)
        putWorkspace(pid, pageKey, {
          editing: true,
          record_id: id === 'new' ? '' : id,
          draft_id: draftId,
          query: '',
          filter: 'all',
        });
    }
  } catch {
    /* Browser access may fail; server migration and active in-memory drafts remain intact. */
  }
}

export function loadWorkspace(pid: string) {
  if (pid === 'global') return Promise.resolve(true);
  let promise = loading.get(pid);
  if (!promise) {
    promise = api<Record<string, Cell>>(`/projects/${pid}/workspace`)
      .then((cells) => {
        for (const [key, cell] of Object.entries(cells)) {
          if (!cell || typeof cell.revision !== 'number') continue;
          const state = entry(pid, key);
          if (state.edited && !cell.closed && cell.revision >= state.cell.revision) {
            // Hydration must never replace text typed while the initial read was pending.
            clock = Math.max(clock + 1, cell.revision + 1);
            state.cell = { ...state.cell, revision: clock };
            state.local = writeLocal(storageKey(pid, key), JSON.stringify(state.cell));
            clearTimeout(state.timer);
            state.timer = setTimeout(() => void persist(pid, key, state), 300);
          } else if (cell.revision > state.cell.revision || cell.closed) {
            if (cell.closed && state.edited && state.cell.value?.data)
              putWorkspace(pid, 'draft:' + crypto.randomUUID(), state.cell.value.data);

            state.cell = cell;
            state.local = writeLocal(storageKey(pid, key), JSON.stringify(cell));
          }
          state.saved = cell.revision;
        }
        recoverLegacyLocal(pid);
        emit();
        return true;
      })
      .catch(() => {
        loading.delete(pid);
        recoverLegacyLocal(pid);
        return false;
      });
    loading.set(pid, promise);
  }
  return promise;
}
export function getWorkspace<T>(pid: string, key: string, fallback: T): T {
  const cell = entry(pid, key).cell;
  return cell.closed ? fallback : ((cell.value?.data as T) ?? fallback);
}
export function putWorkspace<T>(pid: string, key: string, value: T, closed = false) {
  const state = entry(pid, key);
  if (state.cell.closed) return;
  clock = Math.max(clock + 1, Date.now(), state.cell.revision + 1);
  state.cell = { revision: clock, value: { data: value }, closed };
  state.local = writeLocal(storageKey(pid, key), JSON.stringify(state.cell));
  state.error = '';
  state.edited = true;
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void persist(pid, key, state), 300);
  emit();
}
export function workspaceStatus(pid: string, key: string) {
  const state = entry(pid, key);
  if (!state.cell.revision) return 'No changes yet';
  if (state.saved >= state.cell.revision) return 'Draft saved on this device';
  if (state.local && state.error.startsWith('A newer workspace'))
    return 'Draft retained locally; another workspace copy is newer. Recover retained text in a new editor.';
  if (state.local)
    return state.error
      ? t('Draft saved in browser. Sync failed: {0} Retry sync or download.', [state.error])
      : 'Draft saved in browser; syncing…';
  return state.error
    ? t('Text is only in memory. {0} Retry or download before closing the app.', [state.error])
    : 'Saving draft… Text is only in memory.';
}
export function retryWorkspace(pid: string, key: string) {
  return persist(pid, key, entry(pid, key));
}
export function useProjectState<T>(pid: string, key: string, fallback: T) {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
  );
  const initial = useRef({ pid, key, fallback });
  if (initial.current.pid !== pid || initial.current.key !== key)
    initial.current = { pid, key, fallback };
  const stable = initial.current.fallback;
  useEffect(() => {
    void loadWorkspace(pid).then((ready) => {
      if (ready && !entry(pid, key).cell.revision) putWorkspace(pid, key, stable);
    });
  }, [pid, key, stable]);
  const value = getWorkspace(pid, key, stable);
  const set = useCallback(
    (next: T | ((old: T) => T)) => {
      const old = getWorkspace(pid, key, stable);
      const value = typeof next === 'function' ? (next as (old: T) => T)(old) : next;
      if (!Object.is(old, value)) putWorkspace(pid, key, value);
    },
    [pid, key, stable],
  );
  return [value, set] as const;
}
export function memoryOnlyDrafts() {
  return [...entries].filter(
    ([key, state]) =>
      (key.includes(':draft:') || key.endsWith(':methodology_work')) &&
      !state.cell.closed &&
      !(state.cell.value?.data as { saved?: boolean })?.saved &&
      !state.local &&
      state.saved < state.cell.revision,
  ).length;
}
export function useMemoryOnlyDrafts() {
  useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
  );
  return memoryOnlyDrafts();
}
window.addEventListener('beforeunload', (event) => {
  if (memoryOnlyDrafts()) {
    event.preventDefault();
    event.returnValue = '';
  }
});

export function workspaceDrafts(pid: string) {
  const prefix = storageKey(pid, 'draft:');
  return [...entries]
    .filter(([key, e]) => key.startsWith(prefix) && e.cell.value?.data)
    .map(([key, e]) => ({ key, data: e.cell.value!.data, closed: e.cell.closed }));
}

export function resetWorkspaceMemory() {
  for (const state of entries.values()) clearTimeout(state.timer);
  entries.clear();
  loading.clear();
}

export function isWorkspaceClosed(pid: string, key: string) {
  return entry(pid, key).cell.closed;
}

export function workspaceRevision(pid: string, key: string) {
  return entry(pid, key).cell.revision;
}

export function memoryDraftValues() {
  return [...entries]
    .filter(
      ([key, state]) =>
        (key.includes(':draft:') || key.endsWith(':methodology_work')) &&
        !state.cell.closed &&
        !(state.cell.value?.data as { saved?: boolean })?.saved &&
        !state.local &&
        state.saved < state.cell.revision,
    )
    .map(([key, state]) => ({ key, draft: state.cell.value?.data }));
}
