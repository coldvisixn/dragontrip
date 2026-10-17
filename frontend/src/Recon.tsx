import { useProjectState } from './workspace';
import { useEffect, useState, type FormEvent } from 'react';
import { api, type Profile, type Scan, type ScanRequest } from './api';

export function ScanForm({
  initialTarget,
  initialProfile,
  serviceNode,
  servicePort,
  busy,
  onSubmit,
  onClose,
}: {
  initialTarget: string;
  initialProfile: string;
  serviceNode?: string;
  servicePort?: number;
  busy: boolean;
  onSubmit: (request: ScanRequest) => void;
  onClose: () => void;
}) {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileId, setProfile] = useState(initialProfile);
  const [target, setTarget] = useState(initialTarget);
  const [authorized, setAuthorized] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [words, setWords] = useState('admin\nrobots.txt\nlogin');
  const [error, setError] = useState('');
  useEffect(() => {
    api<Profile[]>('/profiles')
      .then((v) => setProfiles(Array.isArray(v) ? v : []))
      .catch((e) => setError(e.message));
  }, []);
  const profile = profiles.find((p) => p.id === profileId);
  const web = profile && profile.tool !== 'nmap';
  const scopePorts =
    profileId === 'service' && serviceNode && servicePort
      ? String(servicePort)
      : profile?.ports || '';
  const count =
    scopePorts
      .split(',')
      .filter(Boolean)
      .reduce((sum, part) => {
        const [first, last] = part.split('-').map(Number);
        return sum + (last || first) - first + 1;
      }, 0) || 0;
  const intrusive =
    profile?.tool === 'ffuf' ||
    !!profile?.scripts?.length ||
    count > 1000 ||
    (profile?.rate || 0) > (profile?.tool === 'nmap' ? 100 : 10);
  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        onSubmit({
          ...(profileId === 'service' && serviceNode ? { service_node: serviceNode } : {}),
          target,
          profile: profileId,
          authorized,
          confirmed,
          words:
            profile?.tool === 'ffuf'
              ? words
                  .split('\n')
                  .map((v) => v.trim())
                  .filter(Boolean)
              : [],
        });
      }}
    >
      <p className="muted">
        Choose a profile. Tasks enter the queue; only explicitly authorized actions run.
      </p>
      {error && <p role="alert">{error}</p>}
      <label>
        Scan profile
        <select
          value={profileId}
          onChange={(e) => {
            setProfile(e.target.value);
            setConfirmed(false);
            setAuthorized(false);
          }}
        >
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.tool}
            </option>
          ))}
        </select>
      </label>
      <label>
        {web ? 'Target HTTP(S) URL · IPv4 host' : 'Target IPv4 address'}
        <input
          required
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={web ? 'http://10.10.10.10:8080/' : '10.10.10.10'}
          className="mono"
        />
      </label>
      {profile && (
        <p className="hint">
          {profile.tool} ·{' '}
          {scopePorts || (web ? 'One web origin · redirects disabled' : 'Top 100 TCP ports')} · rate
          ≤ {profile.rate}/s · timeout {profile.timeout}s
        </p>
      )}
      {profile?.tool === 'ffuf' && (
        <label>
          Wordlist · one relative path per line (maximum 500)
          <textarea required rows={5} value={words} onChange={(e) => setWords(e.target.value)} />
        </label>
      )}
      {!!profile?.scripts?.length && (
        <p className="hint">
          Diagnostic scripts: {profile.scripts.join(', ')}. No arbitrary script names or script
          arguments.
        </p>
      )}
      <label className="checkbox">
        <input
          type="checkbox"
          required
          checked={authorized}
          onChange={(e) => setAuthorized(e.target.checked)}
        />
        <span>
          I own this target or have explicit permission to scan it. This target is within my
          permitted scope.
        </span>
      </label>
      {intrusive && (
        <label className="checkbox">
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span>
            I explicitly approve this higher-traffic scan:{' '}
            {profile?.tool === 'ffuf'
              ? 'wordlist path discovery'
              : 'an extended port range, higher rate or diagnostic NSE scripts'}
            .
          </span>
        </label>
      )}
      <div className="dialog-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={busy || !profile || !authorized || !target || (intrusive && !confirmed)}
        >
          Start scan
        </button>
      </div>
    </form>
  );
}

export function ReconSettings() {
  const [concurrency, setConcurrency] = useState(1);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Scan[]>([]);
  const [message, setMessage] = useState('');
  const [name, setName] = useState('');
  const [tool, setTool] = useState('nmap');
  const [ports, setPorts] = useState('80,443,8080');
  const [scripts, setScripts] = useState<string[]>([]);
  const [rate, setRate] = useState(50);
  const [timeout, setTimeoutValue] = useState(240);
  async function load() {
    try {
      const [queue, values] = await Promise.all([
        api<{ concurrency: number; tasks: Scan[] }>('/queue'),
        api<Profile[]>('/profiles'),
      ]);
      setConcurrency(queue.concurrency || 1);
      setTasks(Array.isArray(queue.tasks) ? queue.tasks : []);
      setProfiles(Array.isArray(values) ? values : []);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!tasks.length) return;
    const timer = window.setInterval(() => {
      void load();
    }, 1500);
    return () => clearInterval(timer);
  }, [tasks.length]);
  return (
    <section className="panel recon-settings">
      <h2>Recon queue</h2>
      <label>
        Concurrent tasks
        <select
          value={concurrency}
          onChange={async (e) => {
            try {
              const value = Number(e.target.value);
              await api('/queue', 'PUT', { concurrency: value });
              setConcurrency(value);
              setMessage('Queue settings saved');
            } catch (error) {
              setMessage((error as Error).message);
            }
          }}
        >
          <option value={1}>1 · recommended for 4 GB</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </label>
      <p className="muted">
        At most 32 queued/running tasks across projects. Restarted tasks are marked interrupted and
        never automatically rerun.
      </p>
      {tasks.map((task) => (
        <div className="recon-task" key={task.id}>
          <span>
            {task.tool} · {task.target} · {task.status}
          </span>
          <button
            onClick={async () => {
              try {
                await api('/scans/' + task.id + '/cancel', 'POST');
                await load();
              } catch (e) {
                setMessage((e as Error).message);
              }
            }}
          >
            Cancel
          </button>
        </div>
      ))}
      <h2>Saved scan profiles</h2>
      <p className="muted">Structured settings only. No arbitrary shell arguments or scripts.</p>
      {profiles.map((p) => (
        <div className="recon-task" key={p.id}>
          <span>
            {p.name} · {p.tool} · {p.ports || 'default scope'} · {p.rate}/s
          </span>
          {!['quick', 'full', 'service', 'whatweb', 'httpx', 'ffuf'].includes(p.id) && (
            <button
              onClick={async () => {
                try {
                  await api('/profiles/' + p.id, 'DELETE');
                  await load();
                } catch (e) {
                  setMessage((e as Error).message);
                }
              }}
            >
              Delete
            </button>
          )}
        </div>
      ))}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await api('/profiles', 'POST', {
              name,
              tool,
              ports: tool === 'nmap' ? ports : '',
              scripts: tool === 'nmap' ? scripts : [],
              rate,
              timeout,
            });
            setName('');
            await load();
            setMessage('Profile saved');
          } catch (error) {
            setMessage((error as Error).message);
          }
        }}
      >
        <label>
          Profile name
          <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          Tool
          <select
            value={tool}
            onChange={(e) => {
              setTool(e.target.value);
              setRate(e.target.value === 'nmap' ? 50 : 5);
            }}
          >
            <option value="nmap">Nmap</option>
            <option value="whatweb">WhatWeb</option>
            <option value="httpx">ProjectDiscovery httpx</option>
            <option value="ffuf">ffuf</option>
          </select>
        </label>
        {tool === 'nmap' && (
          <label>
            Ports · blank for top 100
            <input value={ports} onChange={(e) => setPorts(e.target.value)} />
          </label>
        )}
        {tool === 'nmap' && (
          <fieldset>
            <legend>Optional diagnostic NSE scripts · explicit approval required</legend>
            {['ssh-hostkey', 'smb-protocols', 'ftp-syst', 'rdp-enum-encryption'].map((script) => (
              <label className="checkbox" key={script}>
                <input
                  type="checkbox"
                  checked={scripts.includes(script)}
                  onChange={(e) =>
                    setScripts(
                      e.target.checked
                        ? [...scripts, script]
                        : scripts.filter((value) => value !== script),
                    )
                  }
                />
                <span>{script}</span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="recon-grid">
          <label>
            Maximum rate per second
            <input
              type="number"
              min={1}
              max={tool === 'nmap' ? 1000 : 50}
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </label>
          <label>
            Timeout in seconds
            <input
              type="number"
              min={10}
              max={900}
              value={timeout}
              onChange={(e) => setTimeoutValue(Number(e.target.value))}
            />
          </label>
        </div>
        <button className="primary">Save profile</button>
      </form>
      {message && <p role="status">{message}</p>}
    </section>
  );
}

export function Suggestions({
  pid,
  nodeId,
  revision,
  onChoose,
}: {
  pid: string;
  nodeId: string;
  revision: string;
  onChoose: (profile: string, target: string, nodeId: string) => void;
}) {
  const [items, setItems] = useState<
    { node_id: string; target: string; profile: string; reason: string }[]
  >([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true;
    api<typeof items>('/projects/' + pid + '/recommendations')
      .then((v) => {
        if (mounted) {
          setItems(Array.isArray(v) ? v : []);
          setError('');
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message);
      });
    return () => {
      mounted = false;
    };
  }, [pid, nodeId, revision]);
  const selected = items.filter((item) => item.node_id === nodeId);
  return (
    <>
      {selected.length > 0 && (
        <div className="inspector-section">
          <h3>Recommended enumeration</h3>
          <p className="muted">Review target and confirm each action before it enters the queue.</p>
          {selected.map((item) => (
            <button
              className="recommendation"
              key={item.profile}
              onClick={() => onChoose(item.profile, item.target, item.node_id)}
            >
              <strong>{item.profile}</strong>
              <small>{item.reason}</small>
            </button>
          ))}
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </>
  );
}

export function ScanHistory({
  pid,
  revision,
  onSelect,
}: {
  pid: string;
  revision: string;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useProjectState(pid, 'scan_query', '');
  const [status, setStatus] = useProjectState(pid, 'scan_filter', 'all');
  const [tool, setTool] = useProjectState(pid, 'scan_tool', 'all');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<Scan[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let current = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        q: query,
        status,
        tool,
        offset: String(offset),
        limit: '50',
      });
      api<{ total: number; items: Scan[] }>('/projects/' + pid + '/scan-history?' + params)
        .then((value) => {
          if (current) {
            setRows(value.items);
            setTotal(value.total);
            setError('');
          }
        })
        .catch((error) => {
          if (current) setError(error.message);
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [pid, revision, query, status, tool, offset]);
  return (
    <section aria-label="Scan history">
      <div className="recon-grid">
        <label>
          Search history
          <input
            value={query}
            maxLength={100}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
            placeholder="Target, tool or profile"
          />
        </label>
        <label>
          Status
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            {['all', 'queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted'].map(
              (value) => (
                <option key={value}>{value}</option>
              ),
            )}
          </select>
        </label>
        <label>
          Tool
          <select
            value={tool}
            onChange={(e) => {
              setTool(e.target.value);
              setOffset(0);
            }}
          >
            {['all', 'nmap', 'whatweb', 'httpx', 'ffuf'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {loading && <p role="status">Loading history…</p>}
      {!loading && rows.length === 0 && <p className="muted">No scans match these filters.</p>}
      {rows.map((scan) => (
        <button className="scan-row" key={scan.id} onClick={() => onSelect(scan.id)}>
          <span>
            <strong>{scan.target}</strong>
            <small>
              {scan.tool} · {scan.options?.name || scan.profile} ·{' '}
              {new Date(scan.queued_at || scan.started).toLocaleString()}
            </small>
          </span>
          <span
            className={
              'badge ' +
              (scan.status === 'completed' ? 'success' : scan.status === 'failed' ? 'danger' : '')
            }
          >
            {scan.status}
          </span>
        </button>
      ))}
      <div className="dialog-actions">
        <span>
          {total} scans · page {Math.floor(offset / 50) + 1}
        </span>
        <button
          disabled={offset === 0 || loading}
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Previous
        </button>
        <button disabled={offset + 50 >= total || loading} onClick={() => setOffset(offset + 50)}>
          Next
        </button>
      </div>
    </section>
  );
}
