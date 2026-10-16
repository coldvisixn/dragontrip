import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  FileText,
  GitBranch,
  Plus,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';
import { api, type Detail } from './api';
import { Observations } from './Research';
import Markdown, { MarkdownPreview } from './Markdown';
import { AttachmentLinks, LinkedEvidence } from './Evidence';

export type KnowledgeKind = 'note' | 'finding' | 'path';
type Step = { node_id: string; action: string; status: string };
type Content = {
  body: string;
  node_ids: string[];
  scan_ids: string[];
  attachment_ids: string[];
  severity: string;
  status: string;
  remediation: string;
  steps: Step[];
};
export type KnowledgeRecord = {
  id: string;
  kind: KnowledgeKind;
  title: string;
  content: Content;
  created: string;
  updated: string;
};
const titles = { note: 'Notes', finding: 'Findings', path: 'Attack Paths' };
const singular = { note: 'note', finding: 'finding', path: 'path' };
const icons = { note: FileText, finding: ShieldAlert, path: GitBranch };
const blank = (nodeId?: string): Content => ({
  body: '',
  node_ids: nodeId ? [nodeId] : [],
  scan_ids: [],
  attachment_ids: [],
  severity: 'info',
  status: 'draft',
  remediation: '',
  steps: [],
});

export function ObjectLinks({
  detail,
  ids,
  onChange,
}: {
  detail: Detail;
  ids: string[];
  onChange: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  return (
    <fieldset className="reference-picker">
      <legend>Linked objects</legend>
      <input
        aria-label="Search linked objects"
        placeholder="Search objects to link…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="reference-options">
        {detail.nodes
          .filter((n) => ids.includes(n.id) || n.label.toLowerCase().includes(query.toLowerCase()))
          .map((node) => (
            <label key={node.id} className="check-row">
              <input
                type="checkbox"
                checked={ids.includes(node.id)}
                onChange={(e) =>
                  onChange(
                    e.target.checked ? [...ids, node.id] : ids.filter((id) => id !== node.id),
                  )
                }
              />
              <span>
                {node.label}
                <small>{node.kind}</small>
              </span>
            </label>
          ))}
        {ids
          .filter((id) => !detail.nodes.some((n) => n.id === id))
          .map((id) => (
            <label className="check-row" key={id}>
              <input
                type="checkbox"
                checked
                onChange={() => onChange(ids.filter((n) => n !== id))}
              />
              <span>
                Deleted object<small>{id}</small>
              </span>
            </label>
          ))}
        {!detail.nodes.length && (
          <p className="muted">No objects yet. You can save without a link.</p>
        )}
      </div>
    </fieldset>
  );
}

function Editor({
  detail,
  kind,
  record,
  nodeId,
  onSave,
  onCancel,
}: {
  detail: Detail;
  kind: KnowledgeKind;
  record?: KnowledgeRecord;
  nodeId?: string;
  onSave: (title: string, content: Content) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(record?.title || '');
  const [content, setContent] = useState<Content>({ ...blank(nodeId), ...record?.content });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = <K extends keyof Content>(key: K, value: Content[K]) =>
    setContent((c) => ({ ...c, [key]: value }));
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSave(title.trim(), content);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function step(index: number, value: Partial<Step>) {
    change(
      'steps',
      content.steps.map((s, i) => (i === index ? { ...s, ...value } : s)),
    );
  }
  function move(index: number, offset: number) {
    const steps = [...content.steps];
    [steps[index], steps[index + offset]] = [steps[index + offset], steps[index]];
    change('steps', steps);
  }
  return (
    <form className="knowledge-editor" onSubmit={save}>
      <h2>
        {record ? 'Edit' : 'New'} {singular[kind]}
      </h2>
      <label>
        Title
        <input
          autoFocus
          required
          maxLength={160}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <div className="form-pair">
        <label>
          Status
          <select
            aria-label="Status"
            value={content.status}
            onChange={(e) => change('status', e.target.value)}
          >
            {['draft', 'open', 'confirmed', 'resolved', 'dismissed'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
        {kind === 'finding' && (
          <label>
            Severity
            <select
              aria-label="Severity"
              value={content.severity}
              onChange={(e) => change('severity', e.target.value)}
            >
              {['info', 'low', 'medium', 'high', 'critical'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <label>
        {kind === 'finding' ? 'Description and evidence' : 'Content'}
        <textarea
          aria-label={kind === 'finding' ? 'Description and evidence' : 'Content'}
          rows={7}
          maxLength={12000}
          value={content.body}
          onChange={(e) => change('body', e.target.value)}
          placeholder={
            kind === 'path'
              ? 'Goal, assumptions and reasoning…'
              : 'Context, observations and supporting details…'
          }
        />
      </label>
      <MarkdownPreview source={content.body} />
      {kind === 'finding' && (
        <label>
          Remediation
          <textarea
            aria-label="Remediation"
            maxLength={6000}
            value={content.remediation}
            onChange={(e) => change('remediation', e.target.value)}
            placeholder="Recommended fix and how to verify it…"
          />
        </label>
      )}
      {kind === 'path' && (
        <section className="path-editor">
          <div className="section-actions">
            <h3>Ordered steps</h3>
            <button
              type="button"
              disabled={!detail.nodes.length || content.steps.length >= 50}
              onClick={() =>
                change('steps', [
                  ...content.steps,
                  { node_id: detail.nodes[0].id, action: '', status: 'planned' },
                ])
              }
            >
              <Plus size={14} />
              Add step
            </button>
          </div>
          <p className="muted">Manual investigation plan. Steps never execute tools.</p>
          {content.steps.map((s, i) => (
            <fieldset key={i}>
              <legend>Step {i + 1}</legend>
              <label>
                Object
                <select
                  aria-label="Object"
                  value={s.node_id}
                  onChange={(e) => step(i, { node_id: e.target.value })}
                >
                  {!detail.nodes.some((n) => n.id === s.node_id) && (
                    <option value={s.node_id}>Deleted object</option>
                  )}
                  {detail.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Action or rationale
                <input
                  required
                  maxLength={500}
                  value={s.action}
                  onChange={(e) => step(i, { action: e.target.value })}
                />
              </label>
              <label>
                Step status
                <select
                  aria-label="Step status"
                  value={s.status}
                  onChange={(e) => step(i, { status: e.target.value })}
                >
                  {['planned', 'validated', 'blocked'].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
              <div className="step-actions">
                <button
                  type="button"
                  aria-label={`Move step ${i + 1} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Move step ${i + 1} down`}
                  disabled={i === content.steps.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Remove step ${i + 1}`}
                  onClick={() =>
                    change(
                      'steps',
                      content.steps.filter((_, j) => j !== i),
                    )
                  }
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </fieldset>
          ))}
        </section>
      )}
      <AttachmentLinks
        pid={detail.project.id}
        ids={content.attachment_ids}
        onChange={(ids) => change('attachment_ids', ids)}
      />
      <ObjectLinks
        detail={detail}
        ids={content.node_ids}
        onChange={(ids) => change('node_ids', ids)}
      />
      <fieldset className="reference-picker">
        <legend>Source scans</legend>
        <div className="reference-options">
          {[...new Set([...content.scan_ids, ...detail.scans.map((s) => s.id)])].map((id) => {
            const scan = detail.scans.find((s) => s.id === id);
            return (
              <label className="check-row" key={id}>
                <input
                  type="checkbox"
                  checked={content.scan_ids.includes(id)}
                  onChange={(e) =>
                    change(
                      'scan_ids',
                      e.target.checked
                        ? [...content.scan_ids, id]
                        : content.scan_ids.filter((s) => s !== id),
                    )
                  }
                />
                <span>
                  {scan
                    ? `${scan.tool || 'nmap'} · ${scan.target} · ${scan.status}`
                    : 'Historical scan ' + id}
                  <small>{scan ? new Date(scan.started).toLocaleString() : id}</small>
                </span>
              </label>
            );
          })}
          {!detail.scans.length && !content.scan_ids.length && (
            <p className="muted">No scans yet.</p>
          )}
        </div>
      </fieldset>
      <label>
        Link historical scan by ID
        <input
          placeholder="Scan ID from history"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const id = e.currentTarget.value.trim();
              if (id && !content.scan_ids.includes(id))
                change('scan_ids', [...content.scan_ids, id]);
              e.currentTarget.value = '';
            }
          }}
        />
        <small>Press Enter to add. The server verifies project ownership.</small>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={busy || !title.trim() || (kind === 'path' && !content.steps.length)}
        >
          {busy ? 'Saving…' : 'Save ' + singular[kind]}
        </button>
      </div>
    </form>
  );
}

export default function Knowledge({
  detail,
  kind,
  nodeId,
  focusId,
  onNode,
  onScan,
  onChanged,
}: {
  detail: Detail;
  kind: KnowledgeKind;
  nodeId?: string;
  focusId?: string;
  onNode: (id: string) => void;
  onScan: (id: string) => void;
  onChanged: () => Promise<unknown>;
}) {
  const pid = detail.project.id;
  const [items, setItems] = useState<KnowledgeRecord[]>([]);
  const [selected, setSelected] = useState<KnowledgeRecord>();
  const [editing, setEditing] = useState(Boolean(nodeId));
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [revision, setRevision] = useState(0);
  const [editorVersion, setEditorVersion] = useState(0);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  useEffect(() => {
    if (!focusId) return;
    let disposed = false;
    api<KnowledgeRecord>(`/projects/${pid}/knowledge/${focusId}`)
      .then((row) => {
        if (!disposed) {
          setSelected(row);
          setEditing(false);
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [pid, focusId]);
  useEffect(() => setOffset(0), [query, revision, filter]);
  const Icon = icons[kind];
  useEffect(() => {
    let disposed = false;
    const timer = setTimeout(() => {
      setLoading(true);
      api<KnowledgeRecord[]>(
        `/projects/${pid}/knowledge?kind=${kind}&q=${encodeURIComponent(query)}&status=${filter}&offset=${offset}&limit=50`,
      )
        .then((rows) => {
          if (!disposed) {
            setItems((previous) =>
              offset
                ? [...previous, ...rows.filter((row) => !previous.some((old) => old.id === row.id))]
                : rows,
            );
            setMore(rows.length === 50);
            setError('');
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        })
        .finally(() => {
          if (!disposed) setLoading(false);
        });
    }, 150);
    return () => {
      disposed = true;
      clearTimeout(timer);
    };
  }, [pid, kind, query, revision, offset, filter]);
  const shown = items.filter((item) => filter === 'all' || item.content.status === filter);
  async function remove() {
    if (!selected || !window.confirm('Delete this ' + singular[kind] + '?')) return;
    setDeleting(true);
    try {
      await api(`/projects/${pid}/knowledge/${selected.id}`, 'DELETE');
      setSelected(undefined);
      setRevision((v) => v + 1);
      await onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }
  return (
    <div className="page knowledge-page">
      <div className="page-heading">
        <div>
          <h1>{titles[kind]}</h1>
          <p>
            {kind === 'path'
              ? 'Turn linked objects into an ordered investigation plan.'
              : kind === 'finding'
                ? 'Document impact, evidence and remediation.'
                : 'Keep context and reasoning close to your evidence.'}
          </p>
        </div>
        <button
          className="primary"
          onClick={() => {
            if (editing && !window.confirm('Discard unsaved changes?')) return;
            setSelected(undefined);
            setEditorVersion((v) => v + 1);
            setEditing(true);
          }}
        >
          <Plus size={15} />
          New {singular[kind]}
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
          <button onClick={() => setRevision((v) => v + 1)}>Retry</button>
        </p>
      )}
      <div className="knowledge-layout">
        <section className="panel knowledge-list">
          <div className="knowledge-filters">
            <label className="search-field">
              <Search size={15} />
              <input
                aria-label={`Search ${titles[kind].toLowerCase()}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search title or content…"
              />
            </label>
            <select
              aria-label="Filter by status"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {['all', 'draft', 'open', 'confirmed', 'resolved', 'dismissed'].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className="knowledge-empty">Loading…</p>
          ) : shown.length === 0 ? (
            <div className="knowledge-empty">
              <Icon size={28} />
              <h2>
                {query || filter !== 'all'
                  ? 'No matching records'
                  : 'A place for your investigation'}
              </h2>
              <p>Create a {singular[kind]} and link it to objects or source scans.</p>
            </div>
          ) : (
            shown.map((item) => (
              <button
                key={item.id}
                className={'knowledge-card ' + (selected?.id === item.id ? 'active' : '')}
                onClick={() => {
                  if (editing && !window.confirm('Discard unsaved changes?')) return;
                  setSelected(item);
                  setEditing(false);
                }}
              >
                <span className="section-actions">
                  <Icon size={16} />
                  <span className={'badge severity-' + item.content.severity}>
                    {kind === 'finding' ? item.content.severity : item.content.status}
                  </span>
                </span>
                <strong>{item.title}</strong>
                <p>
                  {item.content.body ||
                    (kind === 'path'
                      ? item.content.steps.length + ' ordered steps'
                      : 'No description')}
                </p>
                <small>
                  {item.content.node_ids.length} objects ·{' '}
                  {new Date(item.updated).toLocaleDateString()}
                </small>
              </button>
            ))
          )}
          {more && (
            <button
              className="load-more"
              disabled={loading}
              onClick={() => setOffset((v) => v + 50)}
            >
              Load more records
            </button>
          )}
        </section>
        <section className="panel knowledge-detail">
          {editing ? (
            <Editor
              key={selected?.id || 'new-' + editorVersion}
              detail={detail}
              kind={kind}
              record={selected}
              nodeId={nodeId}
              onCancel={() => setEditing(false)}
              onSave={async (title, content) => {
                const saved = await api<KnowledgeRecord>(
                  `/projects/${pid}/knowledge` + (selected ? '/' + selected.id : ''),
                  selected ? 'PUT' : 'POST',
                  { kind, title, content },
                );
                setItems((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
                setSelected(saved);
                setEditing(false);
                setRevision((v) => v + 1);
                await onChanged();
              }}
            />
          ) : selected ? (
            <article className="knowledge-article">
              <div className="section-actions">
                <span className="badge">{selected.content.status}</span>
                <button onClick={() => setEditing(true)}>Edit {singular[kind]}</button>
              </div>
              <h2>{selected.title}</h2>
              {kind === 'finding' && (
                <span className={'badge severity-' + selected.content.severity}>
                  {selected.content.severity}
                </span>
              )}
              <Markdown source={selected.content.body || 'No description.'} />
              {kind === 'finding' && (
                <>
                  <h3>Remediation</h3>
                  <Markdown source={selected.content.remediation || 'Not specified.'} />
                </>
              )}
              {kind === 'path' && (
                <ol className="path-steps">
                  {selected.content.steps.map((s, i) => (
                    <li key={i}>
                      <span className="badge">{s.status}</span>
                      <p>{s.action}</p>
                      {detail.nodes.some((n) => n.id === s.node_id) ? (
                        <button onClick={() => onNode(s.node_id)}>
                          {detail.nodes.find((n) => n.id === s.node_id)?.label}
                        </button>
                      ) : (
                        <small>Deleted object · {s.node_id}</small>
                      )}
                    </li>
                  ))}
                </ol>
              )}
              <h3>Linked objects</h3>
              <div className="linked-items">
                {selected.content.node_ids.map((id) =>
                  detail.nodes.some((n) => n.id === id) ? (
                    <button key={id} onClick={() => onNode(id)}>
                      {detail.nodes.find((n) => n.id === id)?.label}
                    </button>
                  ) : (
                    <small key={id}>Deleted object · {id}</small>
                  ),
                )}
                {!selected.content.node_ids.length && <p className="muted">No linked objects.</p>}
              </div>
              {kind === 'finding' && (
                <Observations key={selected.id} pid={pid} findingId={selected.id} />
              )}
              <LinkedEvidence pid={pid} ids={selected.content.attachment_ids || []} />
              <h3>Source scans</h3>
              <div className="linked-items">
                {selected.content.scan_ids.map((id) => (
                  <button key={id} onClick={() => onScan(id)}>
                    {detail.scans.find((s) => s.id === id)?.target || id}
                  </button>
                ))}
                {!selected.content.scan_ids.length && (
                  <p className="muted">No source scans linked.</p>
                )}
              </div>
              <small>
                Updated {new Date(selected.updated).toLocaleString()} · Investigation record
              </small>
              <div className="dialog-actions">
                <button className="danger-button" disabled={deleting} onClick={() => void remove()}>
                  Delete {singular[kind]}
                </button>
              </div>
            </article>
          ) : (
            <div className="knowledge-empty">
              <Icon size={32} />
              <h2>Select a {singular[kind]}</h2>
              <p>Open a record to read, edit and follow its evidence links.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
