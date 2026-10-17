import { useEffect, useRef, useState, type FormEvent } from 'react';
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
import { api, ApiError, type Detail } from './api';
import { Observations } from './Research';
import { useProjectState, getWorkspace, isWorkspaceClosed } from './workspace';
import { DraftStatus, closeDraft } from './DraftStatus';
import { SourceActions, SourceLinks } from './SourceActions';
import Markdown, { MarkdownPreview } from './Markdown';
import { AttachmentLinks, LinkedEvidence } from './Evidence';

export type KnowledgeKind = 'note' | 'finding' | 'path' | 'task';
type Step = { node_id: string; action: string; status: string };
export type Content = {
  [key: string]: unknown;
  body: string;
  node_ids: string[];
  scan_ids: string[];
  attachment_ids: string[];
  severity: string;
  status: string;
  remediation: string;
  steps: Step[];
  retests?: { at: string; result: string; note: string }[];
};
export type KnowledgeRecord = {
  id: string;
  kind: KnowledgeKind;
  title: string;
  content: Content;
  created: string;
  updated: string;
};
const titles = { note: 'Notes', finding: 'Findings', path: 'Attack Paths', task: 'Tasks' };
const singular = { note: 'note', finding: 'finding', path: 'path', task: 'task' };
const icons = { note: FileText, finding: ShieldAlert, path: GitBranch, task: FileText };
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

export function Editor({
  detail,
  kind,
  record,
  nodeId,
  onSave,
  onCancel,
  draftId,
}: {
  detail: Detail;
  kind: KnowledgeKind;
  record?: KnowledgeRecord;
  nodeId?: string;
  draftId: string;
  onSave: (saved: KnowledgeRecord) => void;
  onCancel: () => void;
}) {
  const pid = detail.project.id;
  const draftKey = 'draft:' + draftId;
  const [draft, setDraft] = useProjectState(pid, draftKey, {
    kind,
    title: record?.title || '',
    content: {
      ...blank(nodeId),
      ...record?.content,
      ...(kind === 'task' && !record ? { status: 'todo' } : {}),
    } as Content,
    record_id: record?.id,
    expected_updated: record?.updated,
    changed: new Date().toISOString(),
    request_id: draftId,
    recovery: undefined as { title: string; content: Content } | undefined,
  });
  const { title, content } = draft;
  const setTitle = (title: string) =>
    setDraft({ ...draft, title, changed: new Date().toISOString() });
  const setContent = (update: (value: Content) => Content) =>
    setDraft({ ...draft, content: update(content), changed: new Date().toISOString() });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState<KnowledgeRecord | null>();
  const alive = useRef(true);
  const saving = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!draft.record_id) return;
    let live = true;
    api<KnowledgeRecord>(`/projects/${pid}/knowledge/${draft.record_id}`)
      .then((current) => {
        if (live && current.updated !== draft.expected_updated) setConflict(current);
      })
      .catch((e) => {
        if (live && e instanceof ApiError && e.status === 404) setConflict(null);
      });
    return () => {
      live = false;
    };
  }, [pid, draft.record_id, draft.expected_updated]);
  const change = <K extends keyof Content>(key: K, value: Content[K]) =>
    setContent((c) => ({ ...c, [key]: value }));
  async function save(e?: FormEvent, copy = false) {
    e?.preventDefault();
    if (saving.current || uploading) return;
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await api<KnowledgeRecord>(
        `/projects/${pid}/knowledge` + (!copy && draft.record_id ? '/' + draft.record_id : ''),
        !copy && draft.record_id ? 'PUT' : 'POST',
        {
          kind,
          title: title.trim(),
          content: copy
            ? {
                ...content,
                retests: [],
                record_ids: [
                  ...new Set([
                    ...((content.record_ids as string[]) || []),
                    ...(draft.record_id ? [draft.record_id] : []),
                  ]),
                ],
              }
            : content,
          expected_updated: copy ? undefined : draft.expected_updated,
          request_id: draft.request_id,
        },
      );
      // Invalidate autosave before refreshing any screen. Refresh failure cannot undo this save.
      closeDraft(pid, draftKey);
      onSave(saved);
    } catch (e) {
      if (alive.current) {
        if (e instanceof ApiError && e.status === 409)
          setConflict((e.detail as { current: KnowledgeRecord }).current);
        else if (e instanceof ApiError && e.status === 404) setConflict(null);
        else
          setError(
            'Record was not confirmed saved. Your draft is retained. Retry saving: ' +
              (e as Error).message,
          );
      }
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }
  function resolveSaved(merge: boolean) {
    if (!conflict) return;
    setDraft({
      ...draft,
      expected_updated: conflict.updated,
      title: merge ? title : conflict.title,
      content: merge
        ? { ...content, retests: conflict.content.retests || [] }
        : { ...blank(), ...conflict.content },
      recovery: { title, content },
      changed: new Date().toISOString(),
    });
    setConflict(undefined);
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
    <form className="knowledge-editor" onSubmit={(e) => void save(e)}>
      <DraftStatus
        pid={pid}
        draftKey={draftKey}
        value={draft}
        onRestore={(value) => {
          const recovered = value as typeof draft;
          if (recovered?.content && typeof recovered.title === 'string')
            setDraft({
              ...draft,
              title: recovered.title,
              content: {
                ...blank(),
                ...recovered.content,
                retests: kind === 'finding' ? content.retests || [] : [],
              },
              recovery: { title, content },
              changed: new Date().toISOString(),
            });
        }}
      />
      {draft.recovery && (
        <button
          type="button"
          onClick={() =>
            setDraft({ ...draft, title: draft.recovery!.title, content: draft.recovery!.content })
          }
        >
          Restore my text before resolution
        </button>
      )}
      {conflict !== undefined && (
        <section className="draft-conflict" role="alert">
          <h3>{conflict ? 'This record changed' : 'The saved record was deleted'}</h3>
          <div className="conflict-versions">
            <div>
              <h4>My draft · {new Date(draft.changed).toLocaleString()}</h4>
              <strong>{title}</strong>
              <pre>{content.body}</pre>
            </div>
            <div>
              <h4>
                Saved version ·{' '}
                {conflict ? new Date(conflict.updated).toLocaleString() : 'unavailable'}
              </h4>
              <strong>{conflict?.title}</strong>
              <pre>{conflict?.content.body}</pre>
            </div>
          </div>
          <button
            type="button"
            disabled={busy || !title.trim()}
            onClick={() => void save(undefined, true)}
          >
            Save my version as a separate record
          </button>
          {conflict && (
            <>
              <button type="button" disabled={busy} onClick={() => resolveSaved(false)}>
                Use saved version (keep my text for recovery)
              </button>
              <button type="button" disabled={busy} onClick={() => resolveSaved(true)}>
                Merge manually in editor
              </button>
              <p>
                For a manual merge, edit the text below and save. Your previous text remains
                recoverable.
              </p>
            </>
          )}
        </section>
      )}
      <SourceLinks source={content.source as Parameters<typeof SourceLinks>[0]['source']} />
      <fieldset disabled={busy} className="editor-fields">
        {kind === 'finding' && (
          <button
            type="button"
            onClick={() =>
              change(
                'body',
                '## Observation\n\n## Steps to reproduce\n\n## Evidence\n\n## Impact\n\n## Next check\n',
              )
            }
          >
            Use finding template
          </button>
        )}
        {!record && (
          <label>
            {kind === 'task' ? 'Task template' : 'Research template'}
            <select
              aria-label={kind === 'task' ? 'Task template' : 'Research template'}
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) change('body', e.target.value);
              }}
            >
              <option value="">Choose a starting point…</option>
              {kind === 'task' && (
                <>
                  <option value="Review discovered services, confirm their purpose and record the result.">
                    Review exposed services
                  </option>
                  <option value="Reproduce the observation, attach evidence and assess its meaning.">
                    Validate a finding
                  </option>
                  <option value="Record the original behavior, verify the fix and preserve the result.">
                    Verify remediation
                  </option>
                </>
              )}
              <option value={'Observed:\n\nHypothesis:\n\nNext check:\n\nResult:\n'}>
                Hypothesis and check
              </option>
              <option
                value={
                  'Target / service:\n\nIdentity and version:\n\nAuthentication:\n\nInteresting paths:\n\nNext check:\n'
                }
              >
                Service enumeration
              </option>
              <option
                value={
                  'Check performed:\n\nExpected result:\n\nActual result:\n\nWhy it failed / evidence:\n\nRetry only if:\n'
                }
              >
                Unsuccessful check
              </option>
            </select>
          </label>
        )}
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
              {(kind === 'task'
                ? ['todo', 'in_progress', 'blocked', 'done', 'cancelled']
                : ['draft', 'open', 'confirmed', 'resolved', 'dismissed']
              ).map((s) => (
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
          <details>
            <summary>Remediation (optional)</summary>
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
          </details>
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
        {kind === 'task' && (
          <details>
            <summary>Task options</summary>
            <label>
              Priority
              <select
                aria-label="Priority"
                value={String(content.priority || 'medium')}
                onChange={(e) => change('priority', e.target.value)}
              >
                {['low', 'medium', 'high', 'urgent'].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </details>
        )}
        {kind === 'task' && (
          <details>
            <summary>Owner and due date</summary>
            <label>
              Owner
              <input
                maxLength={100}
                value={String(content.assignee || '')}
                onChange={(e) => change('assignee', e.target.value)}
              />
            </label>
            <label>
              Due date
              <input
                type="date"
                value={String(content.due_date || '')}
                onChange={(e) => change('due_date', e.target.value || null)}
              />
            </label>
          </details>
        )}
        <details>
          <summary>Objects, sources and evidence</summary>
          <AttachmentLinks
            onBusyChange={setUploading}
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
        </details>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="dialog-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            Close · keep draft
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              closeDraft(pid, draftKey);
              onCancel();
            }}
          >
            Discard draft (retain recovery copy)
          </button>
          <button
            className="primary"
            disabled={
              busy ||
              uploading ||
              conflict !== undefined ||
              !title.trim() ||
              (kind === 'path' && !content.steps.length)
            }
          >
            {busy ? 'Saving…' : 'Save ' + singular[kind]}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function RetestForm({
  pid,
  record,
  onSaved,
}: {
  pid: string;
  record: KnowledgeRecord;
  onSaved: (saved: KnowledgeRecord) => void;
}) {
  const [note, setNote] = useState('');
  const [result, setResult] = useState('inconclusive');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <section>
      <h3>Retest history</h3>
      {(record.content.retests || []).map((entry, i) => (
        <div className="panel" key={i}>
          <strong>
            {entry.result.replaceAll('_', ' ')} · {new Date(entry.at).toLocaleString()}
          </strong>
          <Markdown source={entry.note} />
        </div>
      ))}
      <details>
        <summary>Record a retest</summary>
        <p className="muted">
          Record your manual verification and supporting evidence. Fixed resolves the finding; still
          present confirms it. History is retained.
        </p>
        <form
          className="knowledge-editor"
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError('');
            try {
              onSaved(
                await api(`/projects/${pid}/knowledge/${record.id}/retests`, 'POST', {
                  result,
                  note,
                  expected_updated: record.updated,
                }),
              );
              setNote('');
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="editor-fields" disabled={busy}>
            <label>
              Retest result
              <select
                aria-label="Retest result"
                value={result}
                onChange={(e) => setResult(e.target.value)}
              >
                <option value="inconclusive">Inconclusive</option>
                <option value="fixed">Fixed</option>
                <option value="still_present">Still present</option>
              </select>
            </label>
            <label>
              Retest notes
              <textarea
                required
                maxLength={2000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What you tested, the observed result and relevant evidence references…"
              />
            </label>
            <button disabled={!note.trim()}>Save retest</button>
          </fieldset>
        </form>
        {error && (
          <p role="alert" className="form-error">
            {error}{' '}
            <button
              onClick={async () => {
                try {
                  onSaved(await api(`/projects/${pid}/knowledge/${record.id}`));
                  setError('');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Reload finding
            </button>
          </p>
        )}
      </details>
    </section>
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
  onSeedConsumed,
}: {
  detail: Detail;
  kind: KnowledgeKind;
  nodeId?: string;
  focusId?: string;
  onNode: (id: string) => void;
  onScan: (id: string) => void;
  onChanged: () => Promise<unknown>;
  onSeedConsumed?: () => void;
}) {
  const pid = detail.project.id;
  const [items, setItems] = useState<KnowledgeRecord[]>([]);
  const [selected, setSelected] = useState<KnowledgeRecord>();
  const [view, setView] = useProjectState(pid, 'knowledge:' + kind, {
    editing: Boolean(nodeId),
    record_id: focusId || '',
    draft_id: crypto.randomUUID(),
    query: '',
    filter: 'all',
  });
  const { editing, query, filter } = view;
  useEffect(() => {
    if (nodeId)
      setView((v) => ({ ...v, record_id: '', editing: true, draft_id: crypto.randomUUID() }));
    else if (focusId) setView((v) => ({ ...v, record_id: focusId, editing: false }));
    if (nodeId || focusId) onSeedConsumed?.();
  }, [nodeId, focusId]);

  const setEditing = (editing: boolean) => setView((v) => ({ ...v, editing }));
  const setQuery = (query: string) => setView((v) => ({ ...v, query }));
  const setFilter = (filter: string) => setView((v) => ({ ...v, filter }));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (editing && isWorkspaceClosed(pid, 'draft:' + view.draft_id)) {
      setEditing(false);
      setError(
        'This draft was saved or closed. Your retained text is available in Recover earlier text in a new editor.',
      );
    }
  }, [pid, editing, view.draft_id]);
  const [offset, setOffset] = useState(0);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const id = focusId || view.record_id;
    if (!id) return;
    let disposed = false;
    api<KnowledgeRecord>(`/projects/${pid}/knowledge/${id}`)
      .then((row) => {
        if (!disposed) {
          setSelected(row);
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [pid, focusId, view.record_id]);
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
            setSelected(undefined);
            setView((v) => ({ ...v, record_id: '', draft_id: crypto.randomUUID(), editing: true }));
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
      {!editing && getWorkspace(pid, 'draft:' + view.draft_id, null) && (
        <button onClick={() => setEditing(true)}>Resume editor draft</button>
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
                  setSelected(item);
                  setView((v) => ({ ...v, record_id: item.id, editing: false }));
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
          {editing &&
          (!view.record_id ||
            selected?.id === view.record_id ||
            getWorkspace(pid, 'draft:' + view.draft_id, null)) ? (
            <Editor
              key={view.draft_id}
              draftId={view.draft_id}
              detail={detail}
              kind={kind}
              record={selected}
              nodeId={nodeId}
              onCancel={() => setEditing(false)}
              onSave={(saved) => {
                setItems((rows) => [saved, ...rows.filter((row) => row.id !== saved.id)]);
                if (getWorkspace(pid, 'knowledge:' + kind, view).draft_id !== view.draft_id) return;
                setSelected(saved);
                setView((v) =>
                  v.draft_id === view.draft_id ? { ...v, editing: false, record_id: saved.id } : v,
                );
                setRevision((v) => v + 1);
                void onChanged().catch(() =>
                  setError('Record saved. Screen refresh failed; use Retry to reload the list.'),
                );
              }}
            />
          ) : selected ? (
            <article className="knowledge-article">
              <div className="section-actions">
                <span className="badge">{selected.content.status}</span>
                <button
                  onClick={() =>
                    setView((v) => ({
                      ...v,
                      editing: true,
                      draft_id: crypto.randomUUID(),
                      record_id: selected.id,
                    }))
                  }
                >
                  Edit {singular[kind]}
                </button>
              </div>
              <h2>{selected.title}</h2>
              <SourceLinks
                source={selected.content.source as Parameters<typeof SourceLinks>[0]['source']}
              />
              <SourceActions key={selected.id} pid={pid} source="record" id={selected.id} />
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
                  <RetestForm
                    key={selected.id}
                    pid={pid}
                    record={selected}
                    onSaved={(saved) => {
                      setSelected(saved);
                      setItems((rows) => rows.map((row) => (row.id === saved.id ? saved : row)));
                      void onChanged().catch(() =>
                        setError('Retest saved. Refresh failed; retry loading the list.'),
                      );
                    }}
                  />
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
