import { useEffect, useState, type FormEvent } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { api, type Project } from './api';
import Markdown from './Markdown';
import { useDraft } from './useDraft';
import { type Attachment } from './Evidence';

type Overview = {
  objects: Record<string, number>;
  scans: Record<string, number>;
  records: Record<string, number>;
  tasks: Record<string, number>;
  overdue: number;
  active_risks: Record<string, number>;
  attachments: number;
  as_of: string;
};
const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);

export function ProjectOverview({
  project,
  onTasks,
  onFindings,
  onImport,
  onScope,
  onRecon,
  onProjectChanged,
}: {
  project: Project;
  onTasks: () => void;
  onFindings: () => void;
  onImport?: () => void;
  onScope?: () => void;
  onRecon?: () => void;
  onProjectChanged?: () => Promise<unknown>;
}) {
  const [data, setData] = useState<Overview>();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let disposed = false;
    setLoading(true);
    api<Overview>(`/projects/${project.id}/overview`)
      .then((result) => {
        if (!disposed) {
          setData(result);
          setError('');
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [project.id, revision]);
  const total = data ? sum(data.tasks) : 0;
  const completed = data?.tasks.done || 0;
  const actionable = total - (data?.tasks.cancelled || 0);
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Project overview</h1>
          <p>{project.name} · Investigation progress and current risks.</p>
        </div>
        <button disabled={loading} onClick={() => setRevision((v) => v + 1)}>
          <RefreshCw size={15} />
          Refresh
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {loading && <p role="status">Loading overview…</p>}
      <details className="panel" style={{ marginBottom: 20 }}>
        <summary>Project details</summary>
        <form
          className="knowledge-editor"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            setError('');
            try {
              await api(`/projects/${project.id}`, 'PUT', { name, description });
              await onProjectChanged?.();
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            Project name
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            Project description
            <textarea
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button disabled={saving || !name.trim()}>
            {saving ? 'Saving…' : 'Save project details'}
          </button>
        </form>
      </details>
      {data && (
        <>
          {sum(data.objects) === 0 && (
            <section className="panel start-project">
              <h2>Start with the evidence you already have</h2>
              <p>
                Import Nmap XML, Burp saved items or issues, or HTTP Nuclei JSONL. Preview the
                changes before adding them to this project.
              </p>
              <div className="start-actions">
                <button className="primary" onClick={onImport}>
                  Import results
                </button>
                <button onClick={onScope}>Define target scope</button>
                <button onClick={onRecon}>Start live recon</button>
              </div>
              <small className="muted">
                Importing files sends no traffic. Live recon runs only when you launch a scan.
              </small>
            </section>
          )}
          {sum(data.objects) + sum(data.records) + sum(data.scans) > 0 && (
            <>
              <div className="engagement-metrics">
                {[
                  ['Objects', sum(data.objects)],
                  ['Active findings', sum(data.active_risks)],
                  ['Tasks completed', `${completed} / ${actionable}`],
                  ['Overdue tasks', data.overdue],
                ].map(([label, value]) => (
                  <section className="panel metric-card" key={label}>
                    <small>{label}</small>
                    <strong>{value}</strong>
                  </section>
                ))}
              </div>
              <div className="recon-grid overview-grid">
                <section className="panel">
                  <div className="section-actions">
                    <h2>Work progress</h2>
                    <button onClick={onTasks}>Open task board</button>
                  </div>
                  <progress
                    aria-label="Task completion"
                    max={Math.max(actionable, 1)}
                    value={completed}
                  />
                  <p>
                    {actionable ? Math.round((completed / actionable) * 100) : 0}% complete ·{' '}
                    {data.tasks.blocked || 0} blocked · {data.tasks.cancelled || 0} cancelled
                  </p>
                  <p className="muted">
                    Overdue means an unfinished task with a due date before today in UTC.
                  </p>
                </section>
                <section className="panel">
                  <div className="section-actions">
                    <h2>Active risk</h2>
                    <button onClick={onFindings}>Review findings</button>
                  </div>
                  {['critical', 'high', 'medium', 'low', 'info'].map((s) => (
                    <div className="overview-row" key={s}>
                      <span className={'badge severity-' + s}>{s}</span>
                      <strong>{data.active_risks[s] || 0}</strong>
                    </div>
                  ))}
                  <p className="muted">
                    Draft, open and confirmed findings; resolved and dismissed findings are
                    excluded.
                  </p>
                </section>
                <section className="panel">
                  <h2>Inventory</h2>
                  {['host', 'domain', 'application', 'endpoint', 'service', 'url', 'custom'].map(
                    (s) => (
                      <div className="overview-row" key={s}>
                        <span>{s}</span>
                        <strong>{data.objects[s] || 0}</strong>
                      </div>
                    ),
                  )}
                  <div className="overview-row">
                    <span>Evidence attachments</span>
                    <strong>{data.attachments}</strong>
                  </div>
                </section>
                <section className="panel">
                  <h2>Scan outcomes</h2>
                  {['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'].map(
                    (s) => (
                      <div className="overview-row" key={s}>
                        <span>{s}</span>
                        <strong>{data.scans[s] || 0}</strong>
                      </div>
                    ),
                  )}
                </section>
              </div>
            </>
          )}
          <p className="muted">
            Snapshot: {new Date(data.as_of).toLocaleString()}. Refresh to include recent changes.
          </p>
        </>
      )}
    </div>
  );
}

const defaults = {
  title: 'Investigation report',
  summary: '',
  finding_status: 'confirmed',
  minimum_severity: 'info',
  include_notes: false,
  include_paths: false,
  include_tasks: false,
  include_inventory: true,
  include_scans: false,
  format: 'markdown',
  attachment_ids: [] as string[],
};
export default function Reports({ project }: { project: Project }) {
  const draft = useDraft(project.id, 'report', defaults);
  const options = draft.value;
  const setOptions = draft.change;
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  useEffect(() => {
    let disposed = false;
    api<Attachment[]>(`/projects/${project.id}/attachments`)
      .then((rows) => {
        if (!disposed && Array.isArray(rows)) setAttachments(rows);
      })
      .catch((e: Error) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [project.id]);
  const [preview, setPreview] = useState<{
    markdown: string;
    finding_count: number;
    preview_token: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  function change(value: Partial<typeof defaults>) {
    setOptions((old) => ({ ...old, ...value }));
    setPreview(undefined);
    setMessage('');
  }
  async function generate(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      setPreview(await api(`/projects/${project.id}/report/preview`, 'POST', options));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <div className="page-heading">
        <div>
          <h1>Reports</h1>
          <p>Build a reviewed Markdown, standalone HTML or evidence bundle deliverable.</p>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <div className="report-layout">
        <form className="panel knowledge-editor report-options" onSubmit={generate}>
          <h2>Report contents</h2>
          <p aria-live="polite" className="muted">
            {draft.status}
          </p>
          {draft.error && (
            <p role="alert" className="form-error">
              {draft.error}{' '}
              <button type="button" onClick={draft.retry}>
                Retry draft recovery
              </button>
            </p>
          )}
          <fieldset disabled={busy || !draft.ready}>
            <div className="dialog-actions">
              <button
                type="button"
                onClick={() =>
                  change({
                    finding_status: 'confirmed',
                    include_notes: false,
                    include_paths: false,
                    include_tasks: false,
                    include_inventory: true,
                    include_scans: false,
                  })
                }
              >
                Delivery preset
              </button>
              <button
                type="button"
                onClick={() =>
                  change({
                    finding_status: 'active',
                    include_paths: true,
                    include_tasks: true,
                    include_inventory: true,
                    include_scans: true,
                  })
                }
              >
                Working preset
              </button>
            </div>
            <label>
              Report title
              <input
                required
                maxLength={160}
                value={options.title}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <label>
              Executive summary
              <textarea
                rows={6}
                maxLength={12000}
                value={options.summary}
                onChange={(e) => change({ summary: e.target.value })}
                placeholder="Scope, objectives, main observations and recommended next steps…"
              />
            </label>
            <label>
              Finding status
              <select
                aria-label="Finding status"
                value={options.finding_status}
                onChange={(e) => change({ finding_status: e.target.value })}
              >
                <option value="active">Active (draft, open, confirmed)</option>
                <option value="confirmed">Confirmed only</option>
                <option value="all">All findings</option>
              </select>
            </label>
            <label>
              Minimum severity
              <select
                aria-label="Minimum severity"
                value={options.minimum_severity}
                onChange={(e) => change({ minimum_severity: e.target.value })}
              >
                {['info', 'low', 'medium', 'high', 'critical'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            {(
              [
                ['include_inventory', 'Object inventory'],
                ['include_scans', 'Scan history'],
                ['include_paths', 'Investigation paths'],
                ['include_tasks', 'Task work plan'],
                ['include_notes', 'Notes'],
              ] as const
            ).map(([key, label]) => (
              <label className="check-row" key={key}>
                <input
                  type="checkbox"
                  checked={options[key]}
                  onChange={(e) => change({ [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
            <label>
              Export format
              <select
                aria-label="Export format"
                value={options.format}
                onChange={(e) =>
                  change({
                    format: e.target.value,
                    attachment_ids: e.target.value === 'markdown' ? [] : options.attachment_ids,
                  })
                }
              >
                <option value="markdown">Markdown</option>
                <option value="html">Standalone HTML</option>
                <option value="bundle">ZIP: HTML, Markdown and evidence</option>
              </select>
            </label>
            {options.format !== 'markdown' && (
              <fieldset className="reference-picker">
                <legend>Include evidence files (optional)</legend>
                <p className="muted">
                  Only checked files are copied. Up to 100 files / 32 MiB. Check attachments for
                  sensitive data before sharing.
                </p>
                <div className="reference-options">
                  {attachments.map((item) => (
                    <label className="check-row" key={item.id}>
                      <input
                        type="checkbox"
                        checked={options.attachment_ids.includes(item.id)}
                        onChange={(e) =>
                          change({
                            attachment_ids: e.target.checked
                              ? [...options.attachment_ids, item.id]
                              : options.attachment_ids.filter((id) => id !== item.id),
                          })
                        }
                      />
                      <span>
                        {item.filename}
                        <small>{(item.size / 1024).toFixed(1)} KiB</small>
                      </span>
                    </label>
                  ))}
                  {!attachments.length && (
                    <p className="muted">No evidence files in this project yet.</p>
                  )}
                </div>
              </fieldset>
            )}
            <p className="muted">
              Includes selected authored content and evidence filenames/checksums. Vault entries,
              editor drafts and raw scan buffers are excluded. Attachment bytes are included only
              when explicitly checked. Review the preview before sharing.
            </p>
            <button className="primary" disabled={!options.title.trim()}>
              {busy ? 'Working…' : 'Generate preview'}
            </button>
          </fieldset>
          <button
            type="button"
            disabled={busy || !preview}
            onClick={async () => {
              setBusy(true);
              setError('');
              try {
                const saved = await api<{ path: string; sha256: string }>(
                  `/projects/${project.id}/report/export`,
                  'POST',
                  { ...options, expected_preview: preview?.preview_token },
                );
                setMessage(`Saved: ${saved.path} · SHA-256 ${saved.sha256}`);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={15} />
            {options.format === 'markdown'
              ? 'Export Markdown'
              : options.format === 'html'
                ? 'Export HTML'
                : 'Export bundle'}
          </button>
        </form>
        <section className="panel report-preview" aria-label="Report preview">
          {preview ? (
            <>
              <p className="muted">
                {preview.finding_count} findings selected · Export checks that project content still
                matches this preview.
              </p>
              <Markdown source={preview.markdown} />
            </>
          ) : (
            <div className="knowledge-empty">
              <h2>Build your report</h2>
              <p>Choose sections and finding filters, add a summary, then generate a preview.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
