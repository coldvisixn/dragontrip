import { t as tr, useLocale, localeTag } from './i18n';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type Detail, type Profile, type Scan } from './api';
import { useProjectState, putWorkspace, workspaceRevision } from './workspace';
import { DraftStatus } from './DraftStatus';
import { AttachmentLinks, LinkedEvidence } from './Evidence';

type Check = { key: string; title: string; state: string; note: string };
type Action = { profile: string; target: string; service_node?: string | null; words: string[] };
type ResearchRecord = {
  id: string;
  title: string;
  kind: string;
  updated?: string;
  content: {
    node_ids: string[];
    scan_ids: string[];
    attachment_ids: string[];
    body: string;
    status: string;
    checks: Check[];
    actions: Action[];
    [key: string]: unknown;
  };
};
type Plan = {
  preview_token: string;
  ready: boolean;
  notice: string;
  actions: (Action & { error: string; scope: string; parameters: Profile })[];
  run?: ResearchRecord;
  scans?: Scan[];
  history?: Scan[];
};
const states = [
  ['not_tested', 'Not tested'],
  ['in_progress', 'In progress'],
  ['tested', 'Tested'],
  ['not_applicable', 'Not applicable'],
] as const;

export function Methodologies({ detail }: { detail: Detail }) {
  useLocale();
  const pid = detail.project.id;
  const [records, setRecords] = useState<ResearchRecord[]>([]);
  const [selected, setSelected] = useProjectState<ResearchRecord | undefined>(
    pid,
    'methodology_work',
    undefined,
  );
  const [conflict, setConflict] = useState<ResearchRecord>();
  const [copyId, setCopyId] = useProjectState(pid, 'methodology_copy_id', crypto.randomUUID());
  const [node, setNode] = useProjectState(pid, 'methodology_node', '');
  const [template, setTemplate] = useState('web');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () =>
    api<ResearchRecord[]>(`/projects/${pid}/knowledge?kind=checklist`).then(setRecords);
  useEffect(() => {
    let live = true;
    void api<ResearchRecord[]>(`/projects/${pid}/knowledge?kind=checklist`)
      .then((r) => {
        if (live) setRecords(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [pid]);
  async function create(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api<ResearchRecord>(`/projects/${pid}/methodologies`, 'POST', {
        template,
        node_id: node,
      });
      await load();
      setSelected(r);
      setStatus(tr('Methodology ready. Each result must be recorded explicitly.'));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save(copy = false) {
    if (!selected) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      const r = await api<ResearchRecord>(
        `/projects/${pid}/knowledge${copy ? '' : '/' + selected.id}`,
        copy ? 'POST' : 'PUT',
        {
          kind: 'checklist',
          expected_updated: copy ? undefined : selected.updated,
          request_id: copy ? copyId : undefined,
          title: selected.title,
          content: selected.content,
        },
      );
      setSelected(r);
      setConflict(undefined);
      setStatus(tr('Methodology saved.'));
      await load().catch(() =>
        setError(tr('Methodology saved. The list could not refresh; reopen this screen to retry.')),
      );
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setConflict((e.detail as { current: ResearchRecord }).current);
        setCopyId(crypto.randomUUID());
      } else
        setError(tr('Your methodology draft is retained. Retry saving: ') + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function update(index: number, patch: Partial<Check>) {
    if (selected)
      setSelected({
        ...selected,
        content: {
          ...selected.content,
          checks: selected.content.checks.map((c, i) => (i === index ? { ...c, ...patch } : c)),
        },
      });
  }
  const checks = selected?.content.checks || [];
  return (
    <div className="page methodology-page">
      <div className="page-heading">
        <div>
          <h1>{tr('Methodologies')}</h1>
          <p>
            {tr(
              'Track coverage for a specific application or service. Finding counts never imply that a check is complete.',
            )}
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <form className="panel methodology-create" onSubmit={(e) => void create(e)}>
        <label>
          {tr('Methodology template')}
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="web">{tr('Web application review')}</option>
            <option value="network">{tr('Network service review')}</option>
          </select>
        </label>
        <label>
          {tr('Investigation object')}
          <select
            required
            aria-label={tr('Methodology object')}
            value={node}
            onChange={(e) => setNode(e.target.value)}
          >
            <option value="">{tr('Choose an application or service…')}</option>
            {detail.nodes.map((n) => (
              <option value={n.id} key={n.id}>
                {n.label} · {tr(n.kind)}
              </option>
            ))}
          </select>
        </label>
        <button className="primary" disabled={busy || !node}>
          {tr('Add methodology')}
        </button>
      </form>
      <div className="methodology-layout">
        <aside className="panel methodology-list">
          <h2>{tr('Project coverage')}</h2>
          {!records.length && (
            <p className="muted">
              {tr('Add a methodology to begin. New checks start as not tested.')}
            </p>
          )}
          {records.map((r) => (
            <button
              className={selected?.id === r.id ? 'active' : ''}
              key={r.id}
              onClick={() => {
                setSelected(structuredClone(r));
                setStatus('');
              }}
            >
              <strong>{r.title}</strong>
              <small>
                {r.content.checks.filter((c) => c.state === 'tested').length}
                {tr(' tested ·')}{' '}
                {r.content.checks.filter((c) => c.state === 'not_applicable').length}
                {tr(' not applicable · ')}
                {r.content.checks.length}
                {tr(' checks')}
              </small>
            </button>
          ))}
        </aside>
        {selected && (
          <section className="panel methodology-detail">
            <h2>{selected.title}</h2>
            <DraftStatus pid={pid} draftKey="methodology_work" value={selected} />
            {conflict && (
              <section className="draft-conflict" role="alert">
                <h3>{tr('This methodology changed')}</h3>
                <div className="conflict-versions">
                  <div>
                    <h4>
                      {tr('My draft ·')}{' '}
                      {new Date(workspaceRevision(pid, 'methodology_work')).toLocaleString(
                        localeTag(),
                      )}
                    </h4>
                    <pre>{JSON.stringify(selected.content.checks, null, 2)}</pre>
                  </div>
                  <div>
                    <h4>
                      {tr('Saved version · ')}
                      {conflict.updated}
                    </h4>
                    <pre>{JSON.stringify(conflict.content.checks, null, 2)}</pre>
                  </div>
                </div>
                <button disabled={busy} onClick={() => void save(true)}>
                  {tr('Save my version as a separate methodology')}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    putWorkspace(pid, 'draft:' + crypto.randomUUID(), selected);
                    setSelected(conflict);
                    setConflict(undefined);
                  }}
                >
                  {tr('Use saved version (retain my text)')}
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    putWorkspace(pid, 'draft:' + crypto.randomUUID(), selected);
                    setSelected({ ...selected, updated: conflict.updated });
                    setConflict(undefined);
                  }}
                >
                  {tr('Merge manually in checks below')}
                </button>
              </section>
            )}
            <div className="coverage-summary">
              {states.map(([key, label]) => (
                <span className={'coverage-stat ' + key} key={key}>
                  <strong>{checks.filter((c) => c.state === key).length}</strong>
                  {tr(label)}
                </span>
              ))}
            </div>
            <div className="coverage-bar" aria-label={tr('Methodology coverage')}>
              {checks.map((c) => (
                <span key={c.key} className={c.state} title={c.title + ': ' + c.state} />
              ))}
            </div>
            {checks.map((c, i) => (
              <div className={'methodology-check ' + c.state} key={c.key}>
                <div>
                  <span className="check-index">{i + 1}</span>
                  <strong>{tr(c.title)}</strong>
                  <select
                    aria-label={tr('Check state: ') + c.title}
                    value={c.state}
                    disabled={busy}
                    onChange={(e) => update(i, { state: e.target.value })}
                  >
                    {states.map(([key, label]) => (
                      <option key={key} value={key}>
                        {tr(label)}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  aria-label={tr('Check notes: ') + c.title}
                  placeholder={tr('What was checked, what was observed, and what remains?')}
                  value={c.note}
                  rows={2}
                  maxLength={2000}
                  disabled={busy}
                  onChange={(e) => update(i, { note: e.target.value })}
                />
              </div>
            ))}
            <label>
              {tr('Related scan evidence')}
              <select
                aria-label={tr('Methodology scan evidence')}
                multiple
                value={selected.content.scan_ids}
                onChange={(e) =>
                  setSelected({
                    ...selected,
                    content: {
                      ...selected.content,
                      scan_ids: [...e.target.selectedOptions].map((o) => o.value),
                    },
                  })
                }
              >
                {detail.scans.map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.tool} · {s.target} · {tr(s.status)}
                  </option>
                ))}
              </select>
            </label>
            <AttachmentLinks
              pid={pid}
              ids={selected.content.attachment_ids || []}
              onChange={(ids) =>
                setSelected({ ...selected, content: { ...selected.content, attachment_ids: ids } })
              }
            />
            <LinkedEvidence pid={pid} ids={selected.content.attachment_ids || []} />
            <button
              className="primary"
              disabled={busy || Boolean(conflict)}
              onClick={() => void save()}
            >
              {tr('Save methodology')}
            </button>
          </section>
        )}
      </div>
    </div>
  );
}

export function Workflows({
  detail,
  onScan,
  onChanged,
}: {
  detail: Detail;
  onScan: (scan: Scan) => void;
  onChanged: () => Promise<unknown>;
}) {
  useLocale();
  const pid = detail.project.id;
  const [workflows, setWorkflows] = useState<ResearchRecord[]>([]);
  const [runs, setRuns] = useState<ResearchRecord[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<ResearchRecord>();
  const [plan, setPlan] = useState<Plan>();
  const [runId, setRunId] = useProjectState(pid, 'workflow_run', '');
  const [title, setTitle] = useProjectState(pid, 'workflow_title', 'Web reconnaissance');
  const [actions, setActions] = useProjectState<Action[]>(pid, 'workflow_actions', [
    { profile: 'whatweb', target: '', words: [] },
    { profile: 'httpx', target: '', words: [] },
  ]);
  const [authorized, setAuthorized] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = async () => {
    const [w, r] = await Promise.all([
      api<ResearchRecord[]>(`/projects/${pid}/knowledge?kind=workflow`),
      api<ResearchRecord[]>(`/projects/${pid}/knowledge?kind=workflow_run`),
    ]);
    setWorkflows(w);
    setRuns(r);
  };
  useEffect(() => {
    void load().catch((e) => setError(e.message));
    void api<Profile[]>('/profiles')
      .then(setProfiles)
      .catch((e) => setError(e.message));
  }, [pid]);
  useEffect(() => {
    if (!runId) return;
    let live = true;
    const refresh = () => {
      void api<Plan>(`/projects/${pid}/workflow-runs/${runId}/preview`)
        .then((r) => {
          if (live) setPlan(r);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    };
    refresh();
    const timer = setInterval(refresh, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [pid, runId]);
  async function work(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function update(i: number, patch: Partial<Action>) {
    setActions(actions.map((a, index) => (index === i ? { ...a, ...patch } : a)));
    setPlan(undefined);
  }
  const completed = plan?.scans?.filter((s) => s.status === 'completed').length || 0;
  const allLaunched = Boolean(plan?.run && plan.scans?.length === plan.actions.length);
  const canLaunch = Boolean(
    runId &&
    plan?.ready &&
    plan.run?.content.status === 'open' &&
    !allLaunched &&
    plan.scans?.every((s) => s.status === 'completed'),
  );
  const next = plan?.scans?.length || 0;
  const automatic = plan?.run?.content.execution === 'running';
  const retry = Boolean(
    plan?.scans?.length &&
    ['failed', 'cancelled', 'interrupted'].includes(plan.scans.at(-1)!.status),
  );
  async function control(action: string, payload?: unknown) {
    await api(`/projects/${pid}/workflow-runs/${runId}/${action}`, 'POST', payload);
    setPlan(await api<Plan>(`/projects/${pid}/workflow-runs/${runId}/preview`));
    await load();
    await onChanged();
  }
  return (
    <div className="page workflows-page">
      <div className="page-heading">
        <div>
          <h1>{tr('Recon workflows')}</h1>
          <p>{tr('Review a saved sequence, then run all steps or advance one at a time.')}</p>
        </div>
      </div>
      {error && (
        <p role="alert" className="form-error">
          {tr(error)}
        </p>
      )}
      {message && !(allLaunched && completed === plan?.actions.length) && (
        <p role="status">{message}</p>
      )}
      <details className="panel workflow-editor" open={!workflows.length}>
        <summary>{tr('Create a reusable sequence')}</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void work(async () => {
              const r = await api<ResearchRecord>(`/projects/${pid}/knowledge`, 'POST', {
                kind: 'workflow',
                title,
                content: { status: 'open', actions },
              });
              await load();
              setSelected(r);
              setPlan(undefined);
              setRunId('');
              setMessage(tr('Workflow saved. Preview it before creating a run.'));
            });
          }}
        >
          <label>
            {tr('Workflow name')}
            <input
              aria-label={tr('Workflow name')}
              required
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          {actions.map((a, i) => (
            <div className="workflow-action-editor" key={i}>
              <strong>
                {tr('Step ')}
                {i + 1}
              </strong>
              <label>
                {tr('Profile')}
                <select
                  aria-label={tr('Step {0} profile', [i + 1])}
                  value={a.profile}
                  onChange={(e) => update(i, { profile: e.target.value, service_node: null })}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} · {p.tool}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr('Target')}
                <input
                  aria-label={tr('Step {0} target', [i + 1])}
                  required
                  value={a.target}
                  onChange={(e) => update(i, { target: e.target.value })}
                  placeholder="http://127.0.0.1:8080/"
                />
              </label>
              <label>
                {tr('Use object context')}
                <select
                  aria-label={tr('Step {0} object', [i + 1])}
                  value={a.service_node || ''}
                  onChange={(e) => {
                    const n = detail.nodes.find((n) => n.id === e.target.value);
                    if (n)
                      update(i, {
                        target: String(
                          n.attrs.origin || n.attrs.url || n.attrs.host || n.attrs.ip || '',
                        ),
                        service_node: n.kind === 'service' && a.profile === 'service' ? n.id : null,
                      });
                  }}
                >
                  <option value="">{tr('Choose a known object…')}</option>
                  {detail.nodes
                    .filter((n) => ['host', 'service', 'application', 'url'].includes(n.kind))
                    .map((n) => (
                      <option value={n.id} key={n.id}>
                        {n.label}
                      </option>
                    ))}
                </select>
              </label>
              {profiles.find((p) => p.id === a.profile)?.tool === 'ffuf' && (
                <label>
                  {tr('Relative wordlist')}
                  <textarea
                    aria-label={tr('Step {0} wordlist', [i + 1])}
                    value={a.words.join('\n')}
                    onChange={(e) =>
                      update(i, { words: e.target.value.split('\n').filter(Boolean) })
                    }
                  />
                </label>
              )}
              <div>
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => {
                    const copy = [...actions];
                    [copy[i - 1], copy[i]] = [copy[i], copy[i - 1]];
                    setActions(copy);
                  }}
                >
                  {tr('Move up')}
                </button>
                <button
                  type="button"
                  disabled={actions.length === 1}
                  onClick={() => setActions(actions.filter((_, index) => index !== i))}
                >
                  {tr('Remove step')}
                </button>
              </div>
            </div>
          ))}
          <div className="workflow-buttons">
            <button
              type="button"
              disabled={actions.length >= 8}
              onClick={() =>
                setActions([...actions, { profile: 'whatweb', target: '', words: [] }])
              }
            >
              {tr('Add step')}
            </button>
            <button className="primary" disabled={busy}>
              {tr('Save workflow')}
            </button>
          </div>
        </form>
      </details>
      <div className="workflow-library">
        {workflows.map((w) => (
          <button
            className={selected?.id === w.id && !runId ? 'active' : ''}
            key={w.id}
            onClick={() => {
              setSelected(w);
              setRunId('');
              setPlan(undefined);
              setAuthorized(false);
              setConfirmed(false);
            }}
          >
            <strong>{w.title}</strong>
            <small>
              {w.content.actions.length}
              {tr(' ordered steps')}
            </small>
          </button>
        ))}
      </div>
      {selected && !runId && (
        <section className="panel">
          <h2>{selected.title}</h2>
          <button
            disabled={busy}
            onClick={() =>
              void work(async () => {
                setPlan(
                  await api<Plan>(`/projects/${pid}/workflows/${selected.id}/preview`, 'POST'),
                );
              })
            }
          >
            {tr('Preview workflow')}
          </button>
        </section>
      )}
      {plan && (
        <section className="panel workflow-preview">
          <h2>{runId ? tr('Run progress') : tr('Targets & actions preview')}</h2>
          <p>{plan.notice}</p>
          {plan.run && (
            <p role="status">
              {tr(String(plan.run.content.execution || 'Ready for explicit launch'))} ·{' '}
              {tr(String(plan.run.content.stop_reason || ''))}
            </p>
          )}
          <div className="workflow-progress">
            {completed} / {plan.actions.length}
            {tr(' steps completed')}
          </div>
          {plan.actions.map((a, i) => {
            const scan = plan.scans?.[i];
            return (
              <div className={'workflow-step ' + (scan?.status || 'planned')} key={i}>
                <span className="check-index">{i + 1}</span>
                <div>
                  <h3>{a.parameters?.name || a.profile}</h3>
                  <p className="mono">{a.target}</p>
                  <small>
                    {tr(a.scope)}
                    {tr(' · rate ')}
                    {a.parameters?.rate ?? '—'}
                    {tr(' · timeout')} {a.parameters?.timeout ?? '—'}
                    {tr('s · ports')} {a.parameters?.ports || tr('profile default')}
                  </small>
                  {a.parameters?.scripts?.length ? (
                    <p>
                      {tr('Diagnostic scripts: ')}
                      {a.parameters.scripts.join(', ')}
                    </p>
                  ) : null}
                  {a.words.length > 0 && (
                    <p>
                      {tr('Wordlist: ')}
                      {a.words.join(', ')}
                    </p>
                  )}
                  {a.error && <p className="form-error">{a.error}</p>}
                  {scan && (
                    <>
                      <p className={'badge ' + (scan.status === 'completed' ? 'success' : '')}>
                        {tr(scan.status)}
                      </p>
                      {scan.error && <p>{tr(scan.error)}</p>}
                      <button onClick={() => onScan(scan)}>{tr('Open step results')}</button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
          {!runId && selected && (
            <button
              className="primary"
              disabled={busy || !plan.ready}
              onClick={() =>
                void work(async () => {
                  const r = await api<ResearchRecord>(
                    `/projects/${pid}/workflows/${selected.id}/runs`,
                    'POST',
                    { preview_token: plan.preview_token },
                  );
                  setRunId(r.id);
                  setPlan(undefined);
                  await load();
                })
              }
            >
              {tr('Create run')}
            </button>
          )}
          {plan.history && plan.history.length > (plan.scans?.length || 0) && (
            <details>
              <summary>
                {tr('All attempts · ')}
                {plan.history.length}
              </summary>
              {plan.history.map((s) => (
                <p key={s.id}>
                  <button onClick={() => onScan(s)}>
                    {s.tool} · {s.target} · {tr(s.status)}
                  </button>
                  {s.error}
                </p>
              ))}
            </details>
          )}
          {runId && (
            <>
              {!(allLaunched && completed === plan.actions.length) &&
                plan.run?.content.status === 'open' && (
                  <>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={authorized}
                        disabled={busy}
                        onChange={(e) => setAuthorized(e.target.checked)}
                      />
                      {tr('I am authorized to run the displayed target and action.')}
                    </label>
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        disabled={busy}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      {tr('I confirm higher-traffic or diagnostic-script actions where required.')}
                    </label>
                    <div className="workflow-buttons">
                      {!automatic && (
                        <button
                          className="primary"
                          disabled={busy || !authorized || !plan.ready || retry}
                          onClick={() =>
                            void work(() =>
                              control('automatic', {
                                preview_token: plan.preview_token,
                                authorized: true,
                                confirmed,
                              }),
                            )
                          }
                        >
                          {tr('Run remaining sequence')}
                        </button>
                      )}
                      {automatic && (
                        <button disabled={busy} onClick={() => void work(() => control('pause'))}>
                          {tr('Pause after current step')}
                        </button>
                      )}
                      <button
                        className="primary"
                        disabled={busy || automatic || (!canLaunch && !retry) || !authorized}
                        onClick={() =>
                          void work(async () => {
                            await api<Scan>(
                              `/projects/${pid}/workflow-runs/${runId}/next`,
                              'POST',
                              {
                                preview_token: plan.preview_token,
                                authorized: true,
                                confirmed,
                                retry,
                              },
                            );
                            setAuthorized(false);
                            setConfirmed(false);
                            setPlan(
                              await api<Plan>(`/projects/${pid}/workflow-runs/${runId}/preview`),
                            );
                            setMessage(tr('Step queued. Review its result before continuing.'));
                            await onChanged();
                            await load();
                          })
                        }
                      >
                        {retry ? tr('Retry failed step') : tr('Launch step {0}', [next + 1])}
                      </button>
                      <button
                        disabled={
                          busy ||
                          plan.run?.content.status !== 'open' ||
                          (allLaunched && completed === plan.actions.length)
                        }
                        onClick={() =>
                          void work(async () => {
                            await api(`/projects/${pid}/workflow-runs/${runId}/stop`, 'POST');
                            await onChanged();
                            setPlan(
                              await api<Plan>(`/projects/${pid}/workflow-runs/${runId}/preview`),
                            );
                            await load();
                          })
                        }
                      >
                        {tr('Stop sequence')}
                      </button>
                    </div>
                  </>
                )}
              {allLaunched && completed === plan.actions.length && (
                <p role="status">
                  {tr('Sequence complete. Methodology coverage still requires an explicit review.')}
                </p>
              )}
            </>
          )}
        </section>
      )}
      <section className="panel">
        <h2>{tr('Saved run history')}</h2>
        {!runs.length && (
          <p className="muted">{tr('No runs yet. Saving a workflow does not launch scans.')}</p>
        )}
        {runs.map((r) => (
          <button
            className="workflow-history"
            key={r.id}
            onClick={() => {
              setRunId(r.id);
              setPlan(undefined);
              setAuthorized(false);
              setConfirmed(false);
            }}
          >
            <strong>{r.title}</strong>
            <small>
              {r.content.scan_ids.length}
              {tr(' steps launched ·')}{' '}
              {r.content.status === 'dismissed' ? tr('stopped') : tr('open')}
            </small>
          </button>
        ))}
      </section>
      <p className="muted">
        {tr(
          'Current adapters accept single IPv4 targets/origins. Domains can be mapped and investigated offline; live hostname/CIDR/IPv6 workflow execution remains unavailable.',
        )}
      </p>
    </div>
  );
}
