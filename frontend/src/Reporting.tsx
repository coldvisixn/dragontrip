import { t as tr, useLocale, localeTag } from './i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { api, type Project } from './api';
import Markdown from './Markdown';
import { useDraft } from './useDraft';
import { type Attachment } from './Evidence';
import type { WorkspacePage } from './WorkspaceNavigation';
import { useProjectState } from './workspace';

type Overview = {
  objects: Record<string, number>;
  scans: Record<string, number>;
  records: Record<string, number>;
  tasks: Record<string, number>;
  overdue: number;
  active_risks: Record<string, number>;
  attachments: number;
  as_of: string;
  journey?: {
    stage: string;
    page: WorkspacePage;
    label: string;
    reason: string;
    included_targets: string[];
  };
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
  onNavigate,
}: {
  project: Project;
  onTasks: () => void;
  onFindings: () => void;
  onImport?: () => void;
  onScope?: () => void;
  onRecon?: () => void;
  onProjectChanged?: () => Promise<unknown>;
  onNavigate?: (page: WorkspacePage) => void;
}) {
  useLocale();
  const [data, setData] = useState<Overview>();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [goal, setGoal] = useProjectState(project.id, 'project_goal_draft', project.goal || '');
  const [goalSaved, setGoalSaved] = useState('');
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
          <h1>{tr('Project overview')}</h1>
          <p>
            {project.name}
            {tr(' · Investigation progress and current risks.')}
          </p>
        </div>
        <button
          disabled={loading}
          onClick={() => {
            setRevision((v) => v + 1);
            void onProjectChanged?.();
          }}
        >
          <RefreshCw size={15} />
          {tr('Refresh')}
        </button>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {loading && <p role="status">{tr('Loading overview…')}</p>}
      <section className="panel project-plan" aria-label={tr('Investigation plan')}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (saving) return;
            setSaving(true);
            setError('');
            setGoalSaved('');
            try {
              await api(`/projects/${project.id}/goal`, 'PUT', {
                expected_goal: project.goal || '',
                goal,
              });
              setGoalSaved(tr('Goal saved. Continue with target scope.'));
              await onProjectChanged?.();
              setRevision((v) => v + 1);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            {tr('Investigation goal')}
            <textarea
              maxLength={2000}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder={tr('What question should this investigation answer?')}
            />
          </label>
          <button disabled={saving || goal === (project.goal || '')}>{tr('Save goal')}</button>
          {goalSaved && <p role="status">{tr(goalSaved)}</p>}
        </form>
        {data?.journey && (
          <div className="journey-next">
            <span className="eyebrow">{tr('NEXT STEP')}</span>
            <h2>{tr(data.journey.label)}</h2>
            <p>{tr(data.journey.reason)}</p>
            <p>
              {tr('Scope:')}{' '}
              {data.journey.included_targets.length
                ? data.journey.included_targets.join(', ')
                : tr('Not defined yet')}
            </p>
            <div className="section-actions">
              {data.journey.stage !== 'goal' && (
                <button className="primary" onClick={() => onNavigate?.(data.journey!.page)}>
                  {tr(data.journey.label)}
                </button>
              )}
              <button onClick={onScope}>{tr('Targets & scope')}</button>
              <button onClick={onImport}>{tr('Import results')}</button>
              {data.journey.included_targets.length > 0 && (
                <button onClick={onRecon}>{tr('Review discovery plan')}</button>
              )}
            </div>
          </div>
        )}
      </section>
      <details className="panel" style={{ marginBottom: 20 }}>
        <summary>{tr('Project details')}</summary>
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
            {tr('Project name')}
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {tr('Project description')}
            <textarea
              maxLength={4000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button disabled={saving || !name.trim()}>
            {saving ? tr('Saving…') : tr('Save project details')}
          </button>
        </form>
      </details>
      {data && (
        <>
          {sum(data.objects) === 0 && !data.journey && (
            <section className="panel start-project">
              <h2>{tr('Start with the evidence you already have')}</h2>
              <p>
                {tr(
                  'Import Nmap XML, Burp saved items or issues, or HTTP Nuclei JSONL. Preview the changes before adding them to this project.',
                )}
              </p>
              <div className="start-actions">
                <button className="primary" onClick={onImport}>
                  {tr('Import results')}
                </button>
                <button onClick={onScope}>{tr('Define target scope')}</button>
                <button onClick={onRecon}>{tr('Start live recon')}</button>
              </div>
              <small className="muted">
                {tr(
                  'Importing files sends no traffic. Live recon runs only when you launch a scan.',
                )}
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
                    <small>{tr(String(label))}</small>
                    <strong>{value}</strong>
                  </section>
                ))}
              </div>
              <div className="recon-grid overview-grid">
                <section className="panel">
                  <div className="section-actions">
                    <h2>{tr('Work progress')}</h2>
                    <button onClick={onTasks}>{tr('Open task board')}</button>
                  </div>
                  <progress
                    aria-label={tr('Task completion')}
                    max={Math.max(actionable, 1)}
                    value={completed}
                  />
                  <p>
                    {actionable ? Math.round((completed / actionable) * 100) : 0}
                    {tr('% complete ·')} {data.tasks.blocked || 0}
                    {tr(' blocked · ')}
                    {data.tasks.cancelled || 0}
                    {tr(' cancelled')}
                  </p>
                  <p className="muted">
                    {tr('Overdue means an unfinished task with a due date before today in UTC.')}
                  </p>
                </section>
                <section className="panel">
                  <div className="section-actions">
                    <h2>{tr('Active risk')}</h2>
                    <button onClick={onFindings}>{tr('Review findings')}</button>
                  </div>
                  {['critical', 'high', 'medium', 'low', 'info'].map((s) => (
                    <div className="overview-row" key={s}>
                      <span className={'badge severity-' + s}>{tr(s)}</span>
                      <strong>{data.active_risks[s] || 0}</strong>
                    </div>
                  ))}
                  <p className="muted">
                    {tr(
                      'Draft, open and confirmed findings; resolved and dismissed findings are excluded.',
                    )}
                  </p>
                </section>
                <section className="panel">
                  <h2>{tr('Inventory')}</h2>
                  {['host', 'domain', 'application', 'endpoint', 'service', 'url', 'custom'].map(
                    (s) => (
                      <div className="overview-row" key={s}>
                        <span>{tr(s)}</span>
                        <strong>{data.objects[s] || 0}</strong>
                      </div>
                    ),
                  )}
                  <div className="overview-row">
                    <span>{tr('Evidence attachments')}</span>
                    <strong>{data.attachments}</strong>
                  </div>
                </section>
                <section className="panel">
                  <h2>{tr('Scan outcomes')}</h2>
                  {['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'].map(
                    (s) => (
                      <div className="overview-row" key={s}>
                        <span>{tr(s)}</span>
                        <strong>{data.scans[s] || 0}</strong>
                      </div>
                    ),
                  )}
                </section>
              </div>
            </>
          )}
          <p className="muted">
            {tr('Snapshot: ')}
            {new Date(data.as_of).toLocaleString(localeTag())}
            {tr('. Refresh to include recent changes.')}
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
  useLocale();
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
          <h1>{tr('Reports')}</h1>
          <p>{tr('Build a reviewed Markdown, standalone HTML or evidence bundle deliverable.')}</p>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {tr(error)}
        </p>
      )}
      {message && (
        <p className="success-message" role="status">
          {message}
        </p>
      )}
      <div className="report-layout">
        <form className="panel knowledge-editor report-options" onSubmit={generate}>
          <h2>{tr('Report contents')}</h2>
          <p aria-live="polite" className="muted">
            {tr(draft.status)}
          </p>
          {draft.error && (
            <p role="alert" className="form-error">
              {tr(draft.error)}{' '}
              <button type="button" onClick={draft.retry}>
                {tr('Retry draft recovery')}
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
                {tr('Delivery preset')}
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
                {tr('Working preset')}
              </button>
            </div>
            <label>
              {tr('Report title')}
              <input
                required
                maxLength={160}
                value={options.title}
                onChange={(e) => change({ title: e.target.value })}
              />
            </label>
            <label>
              {tr('Executive summary')}
              <textarea
                rows={6}
                maxLength={12000}
                value={options.summary}
                onChange={(e) => change({ summary: e.target.value })}
                placeholder={tr('Scope, objectives, main observations and recommended next steps…')}
              />
            </label>
            <label>
              {tr('Finding status')}
              <select
                aria-label={tr('Finding status')}
                value={options.finding_status}
                onChange={(e) => change({ finding_status: e.target.value })}
              >
                <option value="active">{tr('Active (draft, open, confirmed)')}</option>
                <option value="confirmed">{tr('Confirmed only')}</option>
                <option value="all">{tr('All findings')}</option>
              </select>
            </label>
            <label>
              {tr('Minimum severity')}
              <select
                aria-label={tr('Minimum severity')}
                value={options.minimum_severity}
                onChange={(e) => change({ minimum_severity: e.target.value })}
              >
                {['info', 'low', 'medium', 'high', 'critical'].map((s) => (
                  <option key={s} value={s}>
                    {tr(s)}
                  </option>
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
                {tr(String(label))}
              </label>
            ))}
            <label>
              {tr('Export format')}
              <select
                aria-label={tr('Export format')}
                value={options.format}
                onChange={(e) =>
                  change({
                    format: e.target.value,
                    attachment_ids: e.target.value === 'markdown' ? [] : options.attachment_ids,
                  })
                }
              >
                <option value="markdown">Markdown</option>
                <option value="html">{tr('Standalone HTML')}</option>
                <option value="bundle">{tr('ZIP: HTML, Markdown and evidence')}</option>
              </select>
            </label>
            {options.format !== 'markdown' && (
              <fieldset className="reference-picker">
                <legend>{tr('Include evidence files (optional)')}</legend>
                <p className="muted">
                  {tr(
                    'Only checked files are copied. Up to 100 files / 32 MiB. Check attachments for sensitive data before sharing.',
                  )}
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
                        <small>
                          {(item.size / 1024).toFixed(1)}
                          {tr(' KiB')}
                        </small>
                      </span>
                    </label>
                  ))}
                  {!attachments.length && (
                    <p className="muted">{tr('No evidence files in this project yet.')}</p>
                  )}
                </div>
              </fieldset>
            )}
            <p className="muted">
              {tr(
                'Includes selected authored content and evidence filenames/checksums. Vault entries, editor drafts and raw scan buffers are excluded. Attachment bytes are included only when explicitly checked. Review the preview before sharing.',
              )}
            </p>
            <button className="primary" disabled={!options.title.trim()}>
              {busy ? tr('Working…') : tr('Generate preview')}
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
                setMessage(tr('Saved: {0} · SHA-256 {1}', [saved.path, saved.sha256]));
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Download size={15} />
            {options.format === 'markdown'
              ? tr('Export Markdown')
              : options.format === 'html'
                ? tr('Export HTML')
                : tr('Export bundle')}
          </button>
        </form>
        <section className="panel report-preview" aria-label={tr('Report preview')}>
          {preview ? (
            <>
              <p className="muted">
                {preview.finding_count}
                {tr(
                  ' findings selected · Export checks that project content still matches this preview.',
                )}
              </p>
              <Markdown source={preview.markdown} />
            </>
          ) : (
            <div className="knowledge-empty">
              <h2>{tr('Build your report')}</h2>
              <p>
                {tr('Choose sections and finding filters, add a summary, then generate a preview.')}
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
