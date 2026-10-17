import { useEffect, useState, type FormEvent } from 'react';
import { api, uploadFile, fetchEvidence, type Detail, type ObjectNode } from './api';
import VirtualList from './VirtualList';
import { useProjectState } from './workspace';
import { SourceActions } from './SourceActions';

type Rule = { value: string; mode: 'include' | 'exclude' };
type Preview = {
  format: string;
  sha256: string;
  preview_token: string;
  duplicate_run_id: string | null;
  summary: Record<string, number>;
  warnings: string[];
  items: {
    locator: string;
    label: string;
    kind: string;
    scope: string;
    selected: boolean;
    match: string;
    finding: string | null;
    finding_match: string | null;
  }[];
};
type Run = {
  id: string;
  format: string;
  sha256: string;
  created: string;
  filename: string;
  attachment_id: string;
  summary: Record<string, unknown>;
};
type Observation = {
  id: string;
  run_id: string;
  finding_id: string | null;
  attachment_id: string;
  locator: string;
  created: string;
  data: Record<string, unknown>;
};

export function ScopePage({ pid, onChanged }: { pid: string; onChanged: () => Promise<unknown> }) {
  const [included, setIncluded] = useState('');
  const [excluded, setExcluded] = useState('');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(true);
  useEffect(() => {
    let live = true;
    api<Rule[]>(`/projects/${pid}/scope`)
      .then((rules) => {
        if (live) {
          setIncluded(
            rules
              .filter((r) => r.mode === 'include')
              .map((r) => r.value)
              .join('\n'),
          );
          setExcluded(
            rules
              .filter((r) => r.mode === 'exclude')
              .map((r) => r.value)
              .join('\n'),
          );
          setBusy(false);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [pid]);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    const entries = (value: string, mode: Rule['mode']) =>
      value
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((value) => ({ value, mode }));
    try {
      const rules = [...entries(included, 'include'), ...entries(excluded, 'exclude')];
      await api(`/projects/${pid}/scope`, 'PUT', { rules });
      await onChanged();
      setStatus('Scope saved. Exclusions take precedence.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page research-page scope-page">
      <h1>Targets & scope</h1>
      <p>
        IPv4/IPv6, CIDR, exact domains, *.subdomains and HTTP origins. Separate entries by a line,
        space or comma.
      </p>
      <p className="muted">
        Domains are explicit targets: an included IP does not automatically include every vhost on
        it. Exported IP exclusions also apply to linked web records. No DNS lookups or hosts-file
        changes occur.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <form className="panel research-form" onSubmit={(e) => void save(e)}>
        <label>
          Included targets
          <textarea
            aria-label="Included targets"
            disabled={busy}
            rows={8}
            value={included}
            onChange={(e) => setIncluded(e.target.value)}
            placeholder={'10.10.10.0/24\napp.htb\n*.app.htb\nhttps://admin.htb:8443'}
          />
        </label>
        <label>
          Excluded targets
          <textarea
            aria-label="Excluded targets"
            disabled={busy}
            rows={5}
            value={excluded}
            onChange={(e) => setExcluded(e.target.value)}
            placeholder={'10.10.10.5\nexternal.app.htb'}
          />
        </label>
        <button className="primary" disabled={busy}>
          Save scope
        </button>
      </form>
      <p className="muted">
        Imports skip excluded records and require an explicit choice for unknown targets. Existing
        scan adapters still accept single IPv4 targets/origins; when rules exist, scan dispatch
        requires a matching inclusion. Live domain/CIDR/IPv6 scanning is a later stage.
      </p>
    </div>
  );
}

export function SourceEvidence({ pid, attachmentId }: { pid: string; attachmentId: string }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="source-evidence">
      <button
        disabled={busy}
        onClick={() => {
          if (preview !== null) {
            setPreview(null);
            return;
          }
          setBusy(true);
          setError('');
          void fetchEvidence(pid, attachmentId)
            .then((blob) => blob.text())
            .then((s) =>
              setPreview(
                s.slice(0, 64000) +
                  (s.length > 64000 ? '\n[Preview truncated; export the original file.]' : ''),
              ),
            )
            .catch((e) => setError(e.message))
            .finally(() => setBusy(false));
        }}
      >
        {preview === null ? 'View original source' : 'Hide source'}
      </button>
      <button
        onClick={() => {
          setError('');
          void api<{ path: string }>(`/projects/${pid}/attachments/${attachmentId}/export`, 'POST')
            .then((r) => setError('Saved: ' + r.path))
            .catch((e) => setError(e.message));
        }}
      >
        Export original
      </button>
      {error && <p role="status">{error}</p>}
      {preview !== null && <pre className="evidence">{preview}</pre>}
    </div>
  );
}

export function Observations({
  pid,
  nodeId,
  findingId,
  focusId,
  onClearFocus,
}: {
  pid: string;
  nodeId?: string;
  findingId?: string;
  focusId?: string;
  onClearFocus?: () => void;
}) {
  const [items, setItems] = useState<Observation[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    setOffset(0);
  }, [nodeId, findingId]);
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams({
      offset: String(offset),
      ...(nodeId ? { node_id: nodeId } : {}),
      ...(findingId ? { finding_id: findingId } : {}),
      ...(focusId ? { observation_id: focusId } : {}),
    });
    api<{ items: Observation[]; total: number }>(`/projects/${pid}/observations?${q}`)
      .then((r) => {
        if (live) {
          setItems(r.items);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [pid, nodeId, findingId, focusId, offset]);
  if (!items.length && !error && !focusId) return null;
  return (
    <section className="import-observations">
      <h3>Imported observations · {total}</h3>
      {focusId && <button onClick={onClearFocus}>Show all observations for this object</button>}
      {focusId && !items.length && (
        <p>Source observation is unavailable. The object and your record are retained.</p>
      )}
      {error && <p role="alert">{error}</p>}
      {items.map((o) => (
        <details key={o.id} open={focusId === o.id || undefined}>
          <summary>
            {o.locator} · {new Date(o.created).toLocaleString()}
          </summary>
          <p className="muted">Import {o.run_id}</p>
          {o.data.url != null && (
            <p>
              {String(o.data.method)} {String(o.data.url)}
            </p>
          )}
          {o.data.status != null && <p>Status: {String(o.data.status)}</p>}
          {Array.isArray(o.data.parameters) && (
            <p>Parameters: {o.data.parameters.join(', ') || 'none exported'}</p>
          )}
          {o.data.request != null && (
            <>
              <h4>Request</h4>
              <pre className="evidence">{String(o.data.request) || 'Not included in export'}</pre>
            </>
          )}
          {o.data.response != null && (
            <>
              <h4>Response</h4>
              <pre className="evidence">{String(o.data.response) || 'Not included in export'}</pre>
            </>
          )}
          {o.data.messages_truncated === true && (
            <p>
              Message preview truncated. The complete bytes are retained in the original export.
            </p>
          )}
          <details>
            <summary>Additional exported fields</summary>
            <pre className="evidence">
              {JSON.stringify(
                Object.fromEntries(
                  Object.entries(o.data).filter(([k]) => !['request', 'response'].includes(k)),
                ),
                null,
                2,
              )}
            </pre>
          </details>
          <SourceActions pid={pid} source="observation" id={o.id} />
          <SourceEvidence pid={pid} attachmentId={o.attachment_id} />
        </details>
      ))}
      {total > 50 && (
        <div>
          <button disabled={!offset} onClick={() => setOffset(offset - 50)}>
            Previous observations
          </button>
          <button disabled={offset + 50 >= total} onClick={() => setOffset(offset + 50)}>
            Next observations
          </button>
        </div>
      )}
    </section>
  );
}

export function ImportsPage({
  pid,
  onChanged,
}: {
  pid: string;
  onChanged: () => Promise<unknown>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [unknown, setUnknown] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [comparison, setComparison] = useState<Record<
    string,
    { id: string; label: string }[]
  > | null>(null);
  const load = () => api<Run[]>(`/projects/${pid}/tool-imports`).then(setRuns);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [pid]);
  async function perform(apply: boolean) {
    if (!file) return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      if (apply && preview) {
        const result = await uploadFile<{ duplicate: boolean }>(
          `/projects/${pid}/tool-import/apply`,
          file,
          { include_unknown: String(unknown), preview_token: preview.preview_token },
        );
        setPreview(null);
        await load();
        await onChanged();
        setStatus(
          result.duplicate
            ? 'This source was already imported. No records changed.'
            : 'Import saved. Open Web applications, Findings or Network Graph to investigate.',
        );
      } else {
        setPreview(
          await uploadFile<Preview>(`/projects/${pid}/tool-import/preview`, file, {
            include_unknown: String(unknown),
          }),
        );
      }
    } catch (e) {
      setError((e as Error).message);
      if (apply) setPreview(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page research-page imports-page">
      <h1>Import tool results</h1>
      <p>
        Nmap XML · Burp saved-items XML · Burp issue XML · Nuclei HTTP JSONL. Importing sends no
        network requests.
      </p>
      <p className="muted">
        Burp: Save items exports selected traffic (Community/Professional); issue XML reports
        require Professional and contain only reported issues. Binary project files and HTML reports
        are unsupported. Original files may contain credentials and session cookies; they stay in
        this local project and its exports.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <section className="panel research-form">
        <label>
          Export file (up to 10 MiB)
          <input
            aria-label="Tool export file"
            type="file"
            accept=".xml,.jsonl,.json,.txt"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setPreview(null);
            }}
          />
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            checked={unknown}
            disabled={busy}
            onChange={(e) => {
              setUnknown(e.target.checked);
              setPreview(null);
            }}
          />
          Include unknown targets for offline investigation (excluded targets are always skipped)
        </label>
        <button disabled={!file || busy} onClick={() => void perform(false)}>
          {busy ? 'Working…' : 'Preview import'}
        </button>
      </section>
      {preview && (
        <section className="panel import-preview">
          <h2>Preview · {preview.format}</h2>
          <p className="source-hash">SHA-256 {preview.sha256}</p>
          {preview.warnings.map((w) => (
            <p className="muted" key={w}>
              {w}
            </p>
          ))}
          {preview.duplicate_run_id && (
            <p>
              This exact source is already in import history. Reimport creates no new records, even
              if scope changed.
            </p>
          )}
          <div className="import-counts">
            {Object.entries(preview.summary).map(([key, value]) => (
              <span key={key}>
                <strong>{value}</strong> {key.replaceAll('_', ' ')}
              </span>
            ))}
          </div>
          <VirtualList
            label="Import preview records"
            items={preview.items}
            rowHeight={76}
            itemKey={(r) => r.locator}
            renderItem={(r) => (
              <div className="import-row">
                <strong title={r.label}>{r.label}</strong>
                <small>
                  {r.scope} · {r.selected ? 'selected' : 'skipped'} · {r.match} · {r.locator}
                  {r.finding ? ` · finding: ${r.finding} (${r.finding_match})` : ''}
                </small>
              </div>
            )}
          />
          <button
            className="primary"
            disabled={
              busy ||
              (!preview.summary.selected &&
                preview.summary.records > 0 &&
                !preview.duplicate_run_id)
            }
            onClick={() => void perform(true)}
          >
            {preview.duplicate_run_id ? 'Confirm existing source' : 'Import selected records'}
          </button>
        </section>
      )}
      <section className="panel">
        <h2>Import history</h2>
        {!runs.length && <p>No sources imported yet.</p>}
        {runs.map((r) => (
          <details key={r.id}>
            <summary>
              {r.filename} · {r.format} · {new Date(r.created).toLocaleString()}
            </summary>
            <p className="source-hash">SHA-256 {r.sha256}</p>
            <pre className="evidence">{JSON.stringify(r.summary, null, 2)}</pre>
            <SourceEvidence pid={pid} attachmentId={r.attachment_id} />
          </details>
        ))}
      </section>
      {runs.length > 1 && (
        <section className="panel research-form">
          <h2>Compare imports</h2>
          <p>
            Choose two imports of the same format. Absence from an export never resolves a finding.
          </p>
          <label>
            Earlier import
            <select
              aria-label="Earlier import"
              value={left}
              onChange={(e) => {
                setLeft(e.target.value);
                setComparison(null);
              }}
            >
              <option value="">Choose…</option>
              {runs.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.filename} · {r.created}
                </option>
              ))}
            </select>
          </label>
          <label>
            Later import
            <select
              aria-label="Later import"
              value={right}
              onChange={(e) => {
                setRight(e.target.value);
                setComparison(null);
              }}
            >
              <option value="">Choose…</option>
              {runs.map((r) => (
                <option value={r.id} key={r.id}>
                  {r.filename} · {r.created}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={!left || !right || left === right}
            onClick={() => {
              setError('');
              void api<Record<string, unknown>>(
                `/projects/${pid}/tool-imports/${right}/compare/${left}`,
              )
                .then((r) => {
                  const { warning, ...groups } = r;
                  setComparison(groups as typeof comparison);
                  setStatus(String(warning));
                })
                .catch((e) => setError(e.message));
            }}
          >
            Compare observations
          </button>
          {comparison &&
            Object.entries(comparison).map(([kind, rows]) => (
              <details key={kind}>
                <summary>
                  {kind.replaceAll('_', ' ')} · {rows.length}
                </summary>
                {rows.slice(0, 100).map((r) => (
                  <p key={r.id}>{r.label}</p>
                ))}
                {rows.length > 100 && <p>Showing first 100; inspect the application for more.</p>}
              </details>
            ))}
        </section>
      )}
    </div>
  );
}

export function WebMap({
  detail,
  onChanged,
  onInspect,
  onFinding,
}: {
  detail: Detail;
  onChanged: () => Promise<unknown>;
  onInspect: (id: string) => void;
  onKnowledge: (id: string, kind: 'Notes' | 'Findings') => void;
  onFinding?: (id: string) => void;
}) {
  const pid = detail.project.id;
  const apps = detail.nodes.filter((n) => n.kind === 'application');
  const [origin, setOrigin] = useProjectState(pid, 'web_origin', '');
  const [selected, setSelected] = useProjectState(pid, 'web_node', '');
  const [query, setQuery] = useProjectState(pid, 'web_query', '');
  const [verb, setVerb] = useProjectState(pid, 'web_method', 'all');
  const [url, setUrl] = useState('');
  const [method, setMethod] = useState('GET');
  const [ip, setIp] = useState('');
  const [appOnly, setAppOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [findings, setFindings] = useState<
    { id: string; title: string; content: { severity: string; status: string } }[]
  >([]);
  const endpoints = detail.nodes.filter((n) => n.kind === 'endpoint' && n.attrs.origin === origin);
  const node = detail.nodes.find((n) => n.id === selected);
  const app = apps.find((n) => n.attrs.origin === origin);
  useEffect(() => {
    if (origin && !apps.some((a) => a.attrs.origin === origin)) {
      setOrigin('');
      setSelected('');
      setError('The saved application was deleted. Choose another application.');
    } else if (selected && !detail.nodes.some((n) => n.id === selected)) {
      setSelected('');
      setError('The saved endpoint was deleted. Choose another endpoint.');
    }
  }, [detail.nodes, origin, selected]);

  useEffect(() => {
    let live = true;
    if (selected)
      api<typeof findings>(`/projects/${pid}/web-findings?node_id=${encodeURIComponent(selected)}`)
        .then((r) => {
          if (live) setFindings(r);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [pid, selected, detail.project.updated]);
  async function add(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const n = await api<ObjectNode>(`/projects/${pid}/web-objects`, 'POST', {
        url,
        method,
        ip,
        application_only: appOnly,
      });
      await onChanged();
      setOrigin(String(n.attrs.origin));
      setSelected(n.id);
      setUrl('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page research-page web-map">
      <h1>Web applications</h1>
      <p>
        Each origin is a separate application, including vhosts on the same IP. Select an
        application to explore its exported endpoints.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <details className="panel">
        <summary>Add application or endpoint manually</summary>
        <form className="research-form" onSubmit={(e) => void add(e)}>
          <label>
            HTTP URL
            <input
              required
              aria-label="Manual web URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://app.htb/login"
              maxLength={4096}
            />
          </label>
          <label>
            HTTP method
            <input
              required
              aria-label="Manual HTTP method"
              value={method}
              onChange={(e) => setMethod(e.target.value.toUpperCase())}
              maxLength={32}
            />
          </label>
          <label>
            Known IP (optional; creates a recorded association)
            <input
              aria-label="Known application IP"
              value={ip}
              onChange={(e) => setIp(e.target.value)}
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={appOnly}
              onChange={(e) => setAppOnly(e.target.checked)}
            />
            Application only
          </label>
          <button className="primary" disabled={busy}>
            Add web object
          </button>
          <p className="muted">
            No request is sent. This does not change project scope or system DNS.
          </p>
        </form>
      </details>
      <label>
        Application
        <select
          aria-label="Web application"
          value={origin}
          onChange={(e) => {
            setOrigin(e.target.value);
            setSelected('');
          }}
        >
          <option value="">Choose an application…</option>
          {apps.map((a) => (
            <option value={String(a.attrs.origin)} key={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {!apps.length && <p>Import Burp traffic or add an application to begin.</p>}
      {app && (
        <section className="panel">
          <h2>{app.label}</h2>
          <p>
            {endpoints.length} endpoints · sources: {String(app.attrs.source)}
          </p>
          <button onClick={() => onInspect(app.id)}>Inspect application in graph</button>
          <div className="research-filters">
            <input
              aria-label="Filter endpoints"
              placeholder="Filter exact URLs…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Endpoint method"
              value={verb}
              onChange={(e) => setVerb(e.target.value)}
            >
              <option value="all">All methods</option>
              {[...new Set(endpoints.map((n) => String(n.attrs.method)))].sort().map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <VirtualList
            label="Application endpoints"
            rowHeight={62}
            items={endpoints.filter(
              (n) =>
                (verb === 'all' || n.attrs.method === verb) &&
                n.label.toLowerCase().includes(query.toLowerCase()),
            )}
            itemKey={(n) => n.id}
            renderItem={(n) => (
              <button
                className={'endpoint-row ' + (selected === n.id ? 'active' : '')}
                title={n.label}
                onClick={() => setSelected(n.id)}
              >
                <strong>{String(n.attrs.method)}</strong>
                <span>{String(n.attrs.url)}</span>
              </button>
            )}
          />
        </section>
      )}
      {node && (
        <section className="panel endpoint-detail">
          <h2>{node.label}</h2>
          <p>
            Parameters:{' '}
            {Array.isArray(node.attrs.parameters)
              ? node.attrs.parameters.join(', ') || 'none exported'
              : 'none exported'}
          </p>
          <div className="research-filters">
            <button onClick={() => onInspect(node.id)}>Inspect in graph</button>
          </div>
          <SourceActions key={'records:' + node.id} pid={pid} source="node" id={node.id} />
          <h3>Linked findings</h3>
          {!findings.length && (
            <p>No linked findings. This does not mean the endpoint has been tested.</p>
          )}
          {findings.map((f) => (
            <p key={f.id}>
              <button onClick={() => onFinding?.(f.id)}>{f.title}</button> · {f.content.severity} ·{' '}
              {f.content.status}
            </p>
          ))}
          <Observations key={node.id} pid={pid} nodeId={node.id} />
        </section>
      )}
    </div>
  );
}
