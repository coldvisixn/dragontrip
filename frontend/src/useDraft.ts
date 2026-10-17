import { useEffect, useRef, useState, type SetStateAction } from 'react';
import { api } from './api';

type Snapshot<T> = { revision: string; value: T | null };
const queues = new Map<string, Promise<unknown>>();
const latest = new Map<string, Snapshot<unknown>>();
let lastTime = 0;
function revision(after = '') {
  lastTime = Math.max(Date.now(), lastTime + 1, Number(after.slice(0, 13)) + 1 || 0);
  return `${lastTime}-${crypto.randomUUID().replaceAll('-', '')}`;
}
function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
  const result = (queues.get(key) || Promise.resolve()).catch(() => {}).then(work);
  queues.set(key, result);
  return result;
}

/** Immediate WebView recovery plus ordered SQLite autosave, isolated by project and record. */
export function useDraft<T extends object>(pid: string, key: string, initial: T) {
  const path = `/projects/${pid}/drafts/${key}`;
  const storageKey = `dragontrip.draft:${pid}:${key}`;
  const initialRef = useRef(initial);
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Loading draft…');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const snapshot = useRef<Snapshot<T>>({ revision: '', value: initial });
  const mounted = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const persisted = useRef('');
  const localOK = useRef(true);
  function mirror(next: Snapshot<T>) {
    latest.set(storageKey, next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      localOK.current = true;
    } catch {
      localOK.current = false;
    }
  }
  function persist(next: Snapshot<T>) {
    if (!next.revision || next.revision === persisted.current) return Promise.resolve();
    return serial(path, () => api(path, 'PUT', next)).then(
      () => {
        persisted.current = next.revision;
        if (mounted.current && snapshot.current.revision === next.revision) {
          setStatus(next.value ? 'Draft saved on this device' : 'Draft cleared');
          setError('');
        }
      },
      (e: Error) => {
        if (mounted.current && snapshot.current.revision === next.revision) {
          setError(
            `${e.message} ${localOK.current ? 'A local recovery copy is available.' : 'Keep this page open; the draft could not be saved.'}`,
          );
          setStatus('Draft sync failed');
        }
      },
    );
  }
  const flushRef = useRef(() => persist(snapshot.current));
  flushRef.current = () => persist(snapshot.current);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let local = latest.get(storageKey) as Snapshot<T> | undefined;
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) || 'null') as Snapshot<T> | null;
      if (stored?.revision && (!local || stored.revision > local.revision)) local = stored;
    } catch {
      /* Server recovery remains available. */
    }
    serial(path, () => api<Snapshot<T>>(path))
      .then((server) => {
        if (cancelled) return;
        const restored = local && local.revision > (server.revision || '') ? local : server;
        snapshot.current = restored?.revision ? restored : { revision: '', value: null };
        persisted.current = server.revision || '';
        if (restored?.revision) mirror(restored);
        setValue(restored?.value || initialRef.current);
        setReady(true);
        setError('');
        setStatus(
          restored?.value ? 'Draft recovered · saved on this device' : 'Drafts save on this device',
        );
        if (restored?.revision && restored.revision !== server.revision) void flushRef.current();
      })
      .catch((e: Error) => {
        if (!cancelled) setError(`${e.message} Retry draft recovery before editing.`);
      });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!localOK.current && snapshot.current.revision !== persisted.current) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      cancelled = true;
      mounted.current = false;
      clearTimeout(timer.current);
      void flushRef.current();
      window.removeEventListener('beforeunload', beforeUnload);
    };
    // A keyed editor owns one project/record for its entire lifetime.
  }, [path, storageKey, attempt]);
  function change(update: SetStateAction<T>) {
    const current = snapshot.current.value || initialRef.current;
    const next = typeof update === 'function' ? (update as (old: T) => T)(current) : update;
    const state = { revision: revision(snapshot.current.revision), value: next };
    snapshot.current = state;
    mirror(state);
    setValue(next);
    setStatus('Saving draft…');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void persist(state), 350);
  }
  async function clear() {
    if (latest.get(storageKey)?.revision !== snapshot.current.revision) return;
    clearTimeout(timer.current);
    const state: Snapshot<T> = { revision: revision(snapshot.current.revision), value: null };
    snapshot.current = state;
    mirror(state);
    await persist(state);
  }
  return { value, change, clear, ready, status, error, retry: () => setAttempt((v) => v + 1) };
}
