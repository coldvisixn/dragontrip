import { useEffect, useState, type FormEvent } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { api, type Project } from './api';
import Markdown from './Markdown';

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
}: {
  project: Project;
  onTasks: () => void;
  onFindings: () => void;
}) {
  const [data, setData] = useState<Overview>();
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
      {data && (
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
                Draft, open and confirmed findings; resolved and dismissed findings are excluded.
              </p>
            </section>
            <section className="panel">
              <h2>Inventory</h2>
              {['host', 'service', 'url', 'custom'].map((s) => (
                <div className="overview-row" key={s}>
                  <span>{s}</span>
                  <strong>{data.objects[s] || 0}</strong>
                </div>
              ))}
              <div className="overview-row">
                <span>Evidence attachments</span>
                <strong>{data.attachments}</strong>
              </div>
            </section>
            <section className="panel">
              <h2>Scan outcomes</h2>
              {['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'].map((s) => (
                <div className="overview-row" key={s}>
                  <span>{s}</span>
                  <strong>{data.scans[s] || 0}</strong>
                </div>
              ))}
            </section>
          </div>
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
  finding_status: 'active',
  minimum_severity: 'info',
  include_notes: false,
  include_paths: true,
  include_tasks: true,
  include_inventory: true,
  include_scans: true,
};
export default function Reports({ project }: { project: Project }) {
  const [options, setOptions] = useState(defaults);
  const [preview, setPreview] = useState<{ markdown: string; finding_count: number }>();
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
          <p>Turn project evidence into a structured Markdown deliverable.</p>
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
          <fieldset disabled={busy}>
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
            <p className="muted">
              Includes selected authored content and evidence filenames/checksums. Vault entries,
              raw scan output and attachment files are excluded. Review the preview before sharing.
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
                  options,
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
            Export Markdown
          </button>
        </form>
        <section className="panel report-preview" aria-label="Report preview">
          {preview ? (
            <>
              <p className="muted">
                {preview.finding_count} findings selected · Export regenerates from current project
                data.
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
