import { t as tr, useLocale } from './i18n';
import { useEffect, useRef, useState } from 'react';
import { api } from './api';
export type LinkedRecord = {
  id: string;
  kind: string;
  title: string;
  content: { status: string; body?: string };
};
export function openRecord(row: LinkedRecord) {
  window.dispatchEvent(new CustomEvent('dragontrip:record', { detail: row }));
}
export function openSource(kind: string, id: string, node_id?: string) {
  window.dispatchEvent(new CustomEvent('dragontrip:source', { detail: { kind, id, node_id } }));
}
export function SourceActions({
  pid,
  source,
  id,
}: {
  pid: string;
  source: 'node' | 'observation' | 'scan' | 'record';
  id: string;
}) {
  useLocale();
  const [rows, setRows] = useState<LinkedRecord[]>([]);
  const [kind, setKind] = useState(source === 'record' ? 'task' : 'note');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const path = `/projects/${pid}/sources/${source}/${encodeURIComponent(id)}/records`;
  const active = useRef<string | null>(path);
  useEffect(() => {
    active.current = path;
    let live = true;
    setLoaded(false);
    setRows([]);
    setBusy(false);
    setError('');
    api<LinkedRecord[]>(path)
      .then((rows) => {
        if (live) {
          setRows(rows);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
      active.current = null;
    };
  }, [path]);
  const available = ['note', 'finding', 'task'].filter(
    (type) => !rows.some((r) => r.kind === type),
  );
  const nextKind = available.includes(kind) ? kind : available[0];
  async function create() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const saved = await api<LinkedRecord>(path, 'POST', { kind: nextKind });
      if (active.current !== path) return;
      setRows((rows) => [...rows.filter((r) => r.id !== saved.id), saved]);
      openRecord(saved);
    } catch (e) {
      if (active.current === path) setError((e as Error).message);
    } finally {
      if (active.current === path) setBusy(false);
    }
  }
  const controls = (
    <div className="section-actions">
      <select
        aria-label={tr('Create linked record type')}
        value={nextKind}
        disabled={busy}
        onChange={(e) => setKind(e.target.value)}
      >
        {available.includes('note') && <option value="note">{tr('Note / hypothesis')}</option>}
        {available.includes('finding') && <option value="finding">{tr('Draft finding')}</option>}
        {available.includes('task') && <option value="task">{tr('Task / check')}</option>}
      </select>
      <button type="button" disabled={busy || !loaded} onClick={() => void create()}>
        {busy ? tr('Creating…') : tr('Create linked record')}
      </button>
    </div>
  );
  return (
    <section className="source-actions" aria-label={tr('Linked investigation')}>
      {rows.length > 0 && (
        <div className="linked-items">
          {rows.map((r) => (
            <button type="button" key={r.id} onClick={() => openRecord(r)}>
              {r.title} · {tr(r.content.status)}
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert">
          {tr(error)}
          <button
            onClick={() => {
              void api<LinkedRecord[]>(path)
                .then((r) => {
                  if (active.current !== path) return;
                  setRows(r);
                  setLoaded(true);
                  setError('');
                })
                .catch((e) => {
                  if (active.current === path) setError(e.message);
                });
            }}
          >
            {tr('Retry')}
          </button>
        </p>
      )}
      {available.length > 0 &&
        (rows.length ? (
          <details>
            <summary>{tr('Add another record type')}</summary>
            {controls}
          </details>
        ) : (
          controls
        ))}
    </section>
  );
}
export function SourceLinks({
  source,
}: {
  source?: {
    observation_id?: string;
    node_id?: string;
    scan_id?: string;
    record_id?: string;
    import_id?: string;
  } | null;
}) {
  useLocale();
  if (!source) return null;
  return (
    <div className="linked-items" aria-label={tr('Record source')}>
      {source.observation_id && (
        <button
          type="button"
          onClick={() => openSource('observation', source.observation_id!, source.node_id)}
        >
          {tr('Source observation')}
        </button>
      )}
      {source.node_id && !source.observation_id && (
        <button type="button" onClick={() => openSource('node', source.node_id!)}>
          {tr('Source object')}
        </button>
      )}
      {source.scan_id && (
        <button type="button" onClick={() => openSource('scan', source.scan_id!)}>
          {tr('Source scan')}
        </button>
      )}
      {source.record_id && (
        <button type="button" onClick={() => openSource('record', source.record_id!)}>
          {tr('Source hypothesis')}
        </button>
      )}
      <details>
        <summary>{tr('Source details')}</summary>
        {source.observation_id && (
          <small>
            {tr('Observation · ')}
            {source.observation_id}
          </small>
        )}
        {source.import_id && (
          <small>
            {tr('Import · ')}
            {source.import_id}
          </small>
        )}
      </details>
    </div>
  );
}
