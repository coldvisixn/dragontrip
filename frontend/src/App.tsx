import { ScanForm, ReconSettings, Suggestions, ScanHistory } from './Recon';
import type { ScanRequest } from './api';
import packageInfo from '../../package.json';
import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  Activity,
  ArrowLeft,
  Clock3,
  Paperclip,
  FileText,
  GitBranch,
  KeyRound,
  ShieldAlert,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  Folder,
  Globe,
  LayoutDashboard,
  LoaderCircle,
  Network,
  Pentagon,
  Play,
  Plus,
  Search,
  Server,
  Settings,
  ShieldCheck,
  Square,
  Terminal,
  Wrench,
  X,
} from 'lucide-react';
import {
  api,
  saveArtifact,
  type Detail,
  type ObjectNode,
  type Project,
  type Scan,
  type Tool,
} from './api';
import VirtualList from './VirtualList';
import { NodeEditor, CustomObjectDetails, RelationshipEditor, PositionEditor } from './NodeEditor';
import Preferences, { useAppearance, type Appearance } from './Preferences';
import ProjectTransfer from './ProjectTransfer';
import { ProjectSearch, SearchResults, Timeline, type SearchResult } from './ProjectActivity';
import { useNavigation } from './navigation';
const Evidence = lazy(() => import('./Evidence'));
const Graph = lazy(() => import('./Graph'));
const Knowledge = lazy(() => import('./Knowledge'));
const Vault = lazy(() => import('./Vault'));
const knowledgeNav = [
  ['Attack Paths', GitBranch],
  ['Findings', ShieldAlert],
  ['Notes', FileText],
  ['Credentials Vault', KeyRound],
  ['Evidence', Paperclip],
  ['Timeline', Clock3],
  ['Project search', Search],
] as const;
const knowledgeKinds = { 'Attack Paths': 'path', Findings: 'finding', Notes: 'note' } as const;
const nav = [
  ['Dashboard', LayoutDashboard],
  ['Projects', Folder],
  ['Hosts', Server],
  ['Network Graph', Network],
  ['Scans', Activity],
  ['Tools', Wrench],
  ['Settings', Settings],
] as const;
type Page = (typeof nav)[number][0] | (typeof knowledgeNav)[number][0];
const active = (s: Scan) => s.status === 'running' || s.status === 'queued';
const date = (s: string) => new Date(s).toLocaleString();
function Empty({
  icon = Network,
  title,
  children,
}: {
  icon?: typeof Network;
  title: string;
  children: ReactNode;
}) {
  const Icon = icon;
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={29} />
      </div>
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const box = ref.current!;
    box.querySelector<HTMLElement>('input,button')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const list = [
          ...box.querySelectorAll<HTMLElement>('button,input,textarea,select,[tabindex="0"]'),
        ];
        const first = list[0],
          last = list[list.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label={title}>
        <header>
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close dialog">
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const {
    page,
    navigate: setPage,
    back,
    forward,
    canBack,
    canForward,
  } = useNavigation<Page>('Dashboard');
  const [appearance, setAppearance] = useAppearance();
  const [knowledgeSeed, setKnowledgeSeed] = useState<{
    nodeId?: string;
    recordId?: string;
    nonce: number;
  }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [pid, setPid] = useState<string | null>(() => localStorage.getItem('dragontrip.project'));
  const [detail, setDetail] = useState<Detail | null>(null);
  const [evidenceFocus, setEvidenceFocus] = useState<string>();
  const [inspected, setInspected] = useState<ObjectNode | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [modal, setModal] = useState<'project' | 'scan' | 'node' | 'command' | null>(null);
  const closeModal = useCallback(() => setModal(null), []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [target, setTarget] = useState('');
  const [profileId, setProfileId] = useState('quick');
  const [serviceNode, setServiceNode] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [nodeKind, setNodeKind] = useState('all');
  const [bottom, setBottom] = useState(false);
  const [tab, setTab] = useState('Terminal Output');
  const [scanId, setScanId] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [context, setContext] = useState<{ id: string; x: number; y: number } | null>(null);
  const generation = useRef(0);
  const activeProject = useRef(pid);
  activeProject.current = pid;
  const nodeMap = useMemo(
    () => new Map(detail?.nodes.map((node) => [node.id, node]) || []),
    [detail?.nodes],
  );
  const object = inspected?.id === selected ? inspected : nodeMap.get(selected || '');
  const selectedEdge = detail?.edges.find((e) => e.id === selected);
  const current = projects.find((p) => p.id === pid);
  const hasActiveScan = detail?.scans.some(active) ?? false;
  const notify = (message: string) => setToast(message);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  const refreshProjects = useCallback(async () => {
    const ps = await api<Project[]>('/projects');
    setProjects(ps);
    return ps;
  }, []);
  const refresh = useCallback(async (id: string) => {
    const expected = generation.current;
    const d = await api<Detail>('/projects/' + id + '?compact=true');
    if (expected === generation.current && activeProject.current === id)
      setDetail((previous) => (JSON.stringify(previous) === JSON.stringify(d) ? previous : d));
    return d;
  }, []);
  const initialize = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([
        refreshProjects(),
        api<Tool[]>('/tools').then(setTools),
        api<{ appearance: Appearance }>('/settings').then((value) => {
          if (value.appearance) setAppearance(value.appearance);
        }),
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [refreshProjects, setAppearance]);
  useEffect(() => {
    void initialize();
  }, [initialize]);
  useEffect(() => {
    generation.current++;
    setDetail(null);
    setNodeKind('all');
    setSelected(null);
    setScan(null);
    setScanId(null);
    if (pid) {
      localStorage.setItem('dragontrip.project', pid);
      void refresh(pid).catch((e) => setError(e.message));
    }
  }, [pid, refresh]);
  useEffect(() => {
    if (!pid || !hasActiveScan) return;
    const timer = setInterval(() => {
      void refresh(pid)
        .then((d) => {
          void refreshProjects();
        })
        .catch((e) => setError(e.message));
    }, 2000);
    return () => clearInterval(timer);
  }, [pid, refresh, refreshProjects, hasActiveScan]);
  const viewedScan = scanId || detail?.scans[0]?.id;
  useEffect(() => {
    setScan(null);
    if (!viewedScan) return;
    let disposed = false;
    let timer: ReturnType<typeof setInterval>;
    const update = () =>
      void api<Scan>('/scans/' + viewedScan)
        .then((s) => {
          if (!disposed) {
            setScan(s);
            if (!active(s)) clearInterval(timer);
          }
        })
        .catch((e) => {
          if (!disposed) setError(e.message);
        });
    update();
    timer = setInterval(update, 1500);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [viewedScan]);
  useEffect(() => {
    setInspected(null);
    if (!pid || !selected || !nodeMap.has(selected)) return;
    let disposed = false;
    api<ObjectNode>('/projects/' + pid + '/nodes/' + encodeURIComponent(selected))
      .then((node) => {
        if (!disposed && node.id === selected) setInspected(node);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [pid, selected, detail?.project.updated]);
  useEffect(() => {
    document.title = `${page} · Dragontrip`;
    if (!modal && !document.activeElement?.matches('input,textarea,select'))
      document.querySelector<HTMLElement>('.main')?.focus({ preventScroll: true });
  }, [page]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuery('');
        setModal((v) => (v === 'command' ? null : 'command'));
      }
      const typing =
        e.target instanceof Element
          ? e.target.closest('input,textarea,select,[contenteditable=true]')
          : null;
      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          setPage('Project search');
        }
        if (pid && e.key.toLowerCase() === 'n') {
          e.preventDefault();
          setModal('node');
        }
        if (pid && e.key.toLowerCase() === 's') {
          e.preventDefault();
          startScan();
        }
      }
      if (e.altKey && !typing && e.key === 'ArrowLeft') {
        e.preventDefault();
        back();
      }
      if (e.altKey && !typing && e.key === 'ArrowRight') {
        e.preventDefault();
        forward();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const form = (document.activeElement as HTMLElement)?.closest('form');
        if (form) {
          e.preventDefault();
          form.requestSubmit();
        }
      }
      if (e.key === 'Delete' && !typing && !modal && object?.kind === 'custom') {
        e.preventDefault();
        void removeNode(object);
      }
      if (e.key === 'Escape') {
        setContext(null);
        if (!modal) setSelected(null);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [pid, modal, back, forward, setPage, object]);
  async function perform(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function openProject(id: string) {
    setPid(id);
    setPage('Network Graph');
  }
  function openSearchResult(item: SearchResult) {
    setSelected(null);
    setModal(null);
    setQuery('');
    if (item.kind === 'object') {
      setNodeKind('all');
      setPage('Network Graph');
      setSelected(item.id);
    } else if (item.kind === 'knowledge') {
      setKnowledgeSeed({ recordId: item.id, nonce: Date.now() });
      setPage(
        item.subtype === 'finding'
          ? 'Findings'
          : item.subtype === 'path'
            ? 'Attack Paths'
            : 'Notes',
      );
    } else if (item.kind === 'scan') {
      setPage('Scans');
      setScanId(item.id);
      setBottom(true);
      setTab('Terminal Output');
    } else if (item.kind === 'attachment') {
      setEvidenceFocus(item.id);
      setPage('Evidence');
    } else setPage('Timeline');
  }
  function newProject() {
    setName('');
    setDescription('');
    setModal('project');
  }
  function startScan() {
    setTarget('');
    setProfileId('quick');
    setServiceNode(undefined);
    setModal('scan');
  }
  async function submitProject(e: FormEvent) {
    e.preventDefault();
    await perform(async () => {
      const p = await api<Project>('/projects', 'POST', { name, description });
      await refreshProjects();
      openProject(p.id);
      setModal(null);
      notify('Project created');
    });
  }
  async function submitScan(request: ScanRequest) {
    if (!pid) return;
    await perform(async () => {
      const s = await api<Scan>('/projects/' + pid + '/scans', 'POST', request);
      setScanId(s.id);
      setBottom(true);
      setTab('Terminal Output');
      await refresh(pid);
      setModal(null);
      notify('Recon task queued');
    });
  }
  async function removeNode(n: ObjectNode) {
    if (!pid || !window.confirm('Delete custom node and its manual relationships?')) return;
    await perform(async () => {
      await api('/projects/' + pid + '/nodes/' + encodeURIComponent(n.id), 'DELETE');
      setSelected(null);
      setContext(null);
      await refresh(pid);
      notify('Custom node deleted');
    });
  }
  const hostCount = detail?.nodes.filter((n) => n.kind === 'host').length || 0;
  const serviceCount = detail?.nodes.filter((n) => n.kind === 'service').length || 0;
  const running = detail?.scans.filter(active).length || 0;
  const projectCards = (
    <div className="project-grid">
      {projects.map((p) => (
        <button key={p.id} className="project-card" onClick={() => openProject(p.id)}>
          <div className="project-symbol">
            <Folder size={23} />
            <ArrowRight size={17} />
          </div>
          <h3>{p.name}</h3>
          <p>{p.description || 'Local security workspace'}</p>
          <footer>
            <span className="dot green" />
            Saved locally<span>{new Date(p.updated).toLocaleDateString()}</span>
          </footer>
        </button>
      ))}
      <button className="project-card new-card" onClick={newProject}>
        <Plus size={24} />
        <strong>Create a project</strong>
        <span>A clean workspace for your next engagement</span>
      </button>
    </div>
  );
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="brand">
          <svg width="30" height="34" viewBox="0 0 30 34" fill="none" aria-hidden="true">
            <path
              d="M4 27 8 8 23 4 18 14 26 16 13 30 15 20 4 27Z"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path d="m8 8 10 6-3 6" stroke="currentColor" />
          </svg>
          <span>
            DRAGONTRIP<small>SECURITY WORKSPACE</small>
          </span>
        </div>
        <button className="workspace-switch" onClick={() => setPage('Projects')}>
          <div className="avatar">P</div>
          <span>
            Personal workspace<small>Local · offline first</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <button
          className="search-button"
          onClick={() => {
            setQuery('');
            setModal('command');
          }}
        >
          <Search size={15} />
          Quick search<kbd>Ctrl K</kbd>
        </button>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.slice(0, 5).map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? 'active' : ''}
              onClick={() => setPage(label)}
            >
              <Icon size={17} />
              {label}
              {label === 'Scans' && running > 0 && <span className="count">{running}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-label future-label">KNOWLEDGE</div>
        <nav>
          {knowledgeNav.map(([n, Icon]) => (
            <button
              key={n}
              className={page === n ? 'active' : ''}
              onClick={() => {
                setKnowledgeSeed(undefined);
                setSelected(null);
                setPage(n);
              }}
            >
              <Icon size={16} />
              {n}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <nav>
            {nav.slice(5).map(([label, Icon]) => (
              <button
                key={label}
                className={page === label ? 'active' : ''}
                onClick={() => setPage(label)}
              >
                <Icon size={17} />
                {label}
              </button>
            ))}
          </nav>
          <div className="local-status">
            <span className="dot green" />
            <span>
              Local environment<small>Dragontrip {packageInfo.version}</small>
            </span>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-button" aria-label="Go back" disabled={!canBack} onClick={back}>
              <ArrowLeft size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Go forward"
              disabled={!canForward}
              onClick={forward}
            >
              <ArrowRight size={15} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
            {current && (
              <>
                <ChevronRight size={13} />
                <span>{current.name}</span>
              </>
            )}
          </div>
          <div className="top-actions">
            <span className="local-pill">
              <span className="dot green" />
              LOCAL ONLY
            </span>
            <button
              className="icon-button"
              title="Command palette (Ctrl+K)"
              onClick={() => {
                setQuery('');
                setModal('command');
              }}
            >
              <Command size={16} />
            </button>
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {error}
            <button onClick={() => setError('')} aria-label="Dismiss error">
              <X size={15} />
            </button>
          </div>
        )}
        <div className="workspace-body">
          <main
            id="main-content"
            tabIndex={-1}
            className={'main ' + (page === 'Network Graph' ? 'graph-main' : '')}
          >
            {loading ? (
              <div className="skeleton-wrap">
                <div className="skeleton" />
                <div className="skeleton" />
                <div className="skeleton" />
              </div>
            ) : (
              <>
                {page === 'Dashboard' && (
                  <div className="page dashboard">
                    <div className="eyebrow">
                      <span className="dot violet" />
                      YOUR LOCAL COMMAND CENTER
                    </div>
                    <div className="page-heading">
                      <div>
                        <h1>Workspace overview</h1>
                        <p>A clear view of your engagements. Every discovery, connected.</p>
                      </div>
                      <button className="primary" onClick={newProject}>
                        <Plus size={16} />
                        New project
                      </button>
                    </div>
                    <div className="stats">
                      {[
                        [Folder, 'Projects', projects.length, 'Independent workspaces'],
                        [Server, 'Hosts', hostCount, 'In the selected project'],
                        [Globe, 'Services', serviceCount, 'Evidence from Nmap'],
                        [Activity, 'Active scans', running, 'Bounded recon queue'],
                      ].map(([Icon, label, value, hint]) => {
                        const I = Icon as typeof Folder;
                        return (
                          <div className="stat" key={String(label)}>
                            <div>
                              <span>{String(label)}</span>
                              <I size={17} />
                            </div>
                            <strong>{String(value)}</strong>
                            <small>{String(hint)}</small>
                          </div>
                        );
                      })}
                    </div>
                    <div className="section-heading">
                      <h2>
                        Your projects <span>{projects.length}</span>
                      </h2>
                      <button className="text-button" onClick={() => setPage('Projects')}>
                        View all
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    {projectCards}
                    <ProjectTransfer
                      project={current}
                      onImported={async (value) => {
                        await refreshProjects();
                        openProject(value.id);
                        notify('Project imported');
                      }}
                    />
                    <div className="dashboard-columns">
                      <section className="panel">
                        <div className="section-heading">
                          <h2>Recent activity</h2>
                          <Activity size={16} />
                        </div>
                        {detail?.events.length ? (
                          <div className="activity-list">
                            {detail.events.slice(0, 6).map((e) => (
                              <div key={e.id}>
                                <span className="event-marker" />
                                <span>
                                  {e.message}
                                  <small>{date(e.created)}</small>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="quiet-empty">Your project activity will appear here.</div>
                        )}
                      </section>
                      <section className="panel">
                        <div className="section-heading">
                          <h2>Environment</h2>
                          <Wrench size={16} />
                        </div>
                        {tools.map((t) => (
                          <div className="tool-row" key={t.name}>
                            <div className="tool-icon">
                              <Terminal size={20} />
                            </div>
                            <span>
                              <strong>{t.name}</strong>
                              <small>
                                {t.version || t.path || 'Install the system nmap package'}
                              </small>
                            </span>
                            <span className={'badge ' + (t.installed ? 'success' : 'warning')}>
                              {t.installed ? 'Installed' : 'Not installed'}
                            </span>
                          </div>
                        ))}
                        <div className="hint">
                          <ShieldCheck size={16} />
                          Scans run locally. Your data stays on this device.
                        </div>
                      </section>
                    </div>
                    {current && (
                      <button className="resume" onClick={() => setPage('Network Graph')}>
                        <Network size={20} />
                        <span>
                          Continue {current.name}
                          <small>Open the saved network graph</small>
                        </span>
                        <ArrowRight size={18} />
                      </button>
                    )}
                  </div>
                )}
                {page === 'Projects' && (
                  <div className="page">
                    <div className="page-heading">
                      <div>
                        <h1>Projects</h1>
                        <p>Separate engagements. A persistent place for every discovery.</p>
                      </div>
                      <button className="primary" onClick={newProject}>
                        <Plus size={16} />
                        New project
                      </button>
                    </div>
                    {projectCards}
                    <ProjectTransfer
                      project={current}
                      onImported={async (value) => {
                        await refreshProjects();
                        openProject(value.id);
                        notify('Project imported');
                      }}
                    />
                  </div>
                )}
                {[
                  'Network Graph',
                  'Hosts',
                  'Scans',
                  ...knowledgeNav.map(([label]) => label),
                ].includes(page) &&
                  !pid && (
                    <Empty title="Choose your workspace" icon={Folder}>
                      Open a project or{' '}
                      <button className="text-button" onClick={newProject}>
                        create a new one
                      </button>{' '}
                      to get started.
                    </Empty>
                  )}
                {[
                  'Network Graph',
                  'Hosts',
                  'Scans',
                  ...knowledgeNav.map(([label]) => label),
                ].includes(page) &&
                  pid &&
                  !detail && (
                    <div className="loading">
                      <LoaderCircle className="spin" />
                      Loading project…
                    </div>
                  )}
                {page === 'Network Graph' && detail && (
                  <>
                    <div className="graph-toolbar">
                      <div>
                        <Network size={18} />
                        <strong>{detail.project.name}</strong>
                        <span className="badge">
                          {detail.nodes.length} objects · {detail.edges.length} links
                        </span>
                      </div>
                      <div>
                        <button
                          onClick={() => {
                            setName('');
                            setModal('node');
                          }}
                        >
                          <Plus size={14} />
                          Custom node
                        </button>
                        <button className="primary" onClick={startScan}>
                          <Play size={13} />
                          Start scan
                        </button>
                      </div>
                    </div>
                    <div className="graph-search">
                      <Search size={14} />
                      <input
                        aria-label="Find graph object"
                        placeholder="Find an object…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                      <select
                        aria-label="Graph object type"
                        value={nodeKind}
                        onChange={(e) => setNodeKind(e.target.value)}
                      >
                        {['all', 'host', 'service', 'url', 'custom'].map((kind) => (
                          <option key={kind} value={kind}>
                            {kind === 'all' ? 'All types' : kind}
                          </option>
                        ))}
                      </select>
                      {query && (
                        <div className="search-results">
                          {detail.nodes
                            .filter((n) =>
                              [
                                n.label,
                                n.kind,
                                n.attrs.title,
                                n.attrs.description,
                                n.attrs.category,
                                n.attrs.status,
                                JSON.stringify(n.attrs.tags || []),
                                JSON.stringify(n.attrs.technologies || []),
                              ]
                                .join(' ')
                                .toLowerCase()
                                .includes(query.toLowerCase()),
                            )
                            .slice(0, 20)
                            .map((n) => (
                              <button
                                key={n.id}
                                onClick={() => {
                                  setNodeKind('all');
                                  setSelected(n.id);
                                  setQuery('');
                                }}
                              >
                                {n.label}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="graph-area">
                      <Suspense fallback={<div className="loading">Loading graph…</div>}>
                        <Graph
                          key={detail.project.id}
                          projectId={detail.project.id}
                          detailMode={appearance.graph_detail}
                          theme={appearance.theme === 'system' ? undefined : appearance.theme}
                          selectedId={selected}
                          objects={detail.nodes.filter(
                            (n) => nodeKind === 'all' || n.kind === nodeKind,
                          )}
                          relations={detail.edges.filter(
                            (edge) =>
                              nodeKind === 'all' ||
                              [edge.source, edge.target].every(
                                (id) => nodeMap.get(id)?.kind === nodeKind,
                              ),
                          )}
                          onSelect={setSelected}
                          onEdge={setSelected}
                          onMove={(id, x, y) => {
                            void api(
                              '/projects/' + pid + '/nodes/' + encodeURIComponent(id) + '/position',
                              'PUT',
                              { x, y },
                            )
                              .then(() => refresh(pid!))
                              .catch((e) => setError('Position was not saved: ' + e.message));
                          }}
                          onConnect={(c) => {
                            if (c.source && c.target)
                              void perform(async () => {
                                await api('/projects/' + pid + '/edges', 'POST', c);
                                await refresh(pid!);
                                notify('Hypothetical relationship saved');
                              });
                          }}
                          onContext={(id, x, y) => {
                            setSelected(id);
                            setContext({ id, x, y });
                          }}
                        />
                      </Suspense>
                      {detail.nodes.length === 0 && (
                        <div className="graph-empty">
                          <Empty title="Your infrastructure starts here">
                            <span>
                              Scan a permitted IPv4 address to discover real hosts and services.
                            </span>
                            <button className="primary" onClick={startScan}>
                              <Play size={14} />
                              Run your first scan
                            </button>
                          </Empty>
                        </div>
                      )}
                    </div>
                    <div className="graph-legend">
                      <span>
                        <i className="line" />
                        Observed relationship
                      </span>
                      <span>
                        <i className="line dashed" />
                        Manual hypothesis
                      </span>
                      <span>Drag handles to connect objects</span>
                    </div>
                  </>
                )}
                {page === 'Hosts' && detail && (
                  <div className="page">
                    <div className="page-heading">
                      <div>
                        <h1>Hosts</h1>
                        <p>Observed infrastructure in {detail.project.name}</p>
                      </div>
                      <button className="primary" onClick={startScan}>
                        <Play size={14} />
                        Start scan
                      </button>
                    </div>
                    {hostCount === 0 ? (
                      <Empty icon={Server} title="No hosts discovered">
                        Start a scan to build an evidence-backed inventory.
                      </Empty>
                    ) : (
                      <div className="inventory">
                        <div className="inventory-head">
                          <span>Address</span>
                          <span>State</span>
                          <span>Services</span>
                          <span>Source</span>
                        </div>
                        <VirtualList
                          items={detail.nodes.filter((n) => n.kind === 'host')}
                          rowHeight={56}
                          itemKey={(n) => n.id}
                          label="Host inventory"
                          renderItem={(n) => (
                            <button className="inventory-row" onClick={() => setSelected(n.id)}>
                              <span className="mono">{n.label}</span>
                              <span>
                                <span className="badge success">{String(n.attrs.state)}</span>
                              </span>
                              <span>
                                {
                                  detail.nodes.filter(
                                    (s) => s.kind === 'service' && s.attrs.host === n.label,
                                  ).length
                                }
                              </span>
                              <span>{String(n.attrs.source || 'nmap')}</span>
                            </button>
                          )}
                        />
                      </div>
                    )}
                  </div>
                )}
                {page === 'Scans' && detail && (
                  <div className="page">
                    <div className="page-heading">
                      <div>
                        <h1>Scan history</h1>
                        <p>Real executions, preserved evidence and exact arguments.</p>
                      </div>
                      <button className="primary" onClick={startScan}>
                        <Plus size={14} />
                        New scan
                      </button>
                    </div>
                    <ScanHistory
                      pid={pid!}
                      revision={detail.scans.map((s) => s.id + s.status).join(',')}
                      onSelect={(id) => {
                        setScanId(id);
                        setBottom(true);
                        setTab('Terminal Output');
                      }}
                    />
                  </div>
                )}
                {page === 'Tools' && (
                  <div className="page">
                    <div className="page-heading">
                      <div>
                        <h1>Tool integrations</h1>
                        <p>System binaries. No duplicated tool installations.</p>
                      </div>
                      <button
                        onClick={() =>
                          void perform(async () => {
                            setTools(await api<Tool[]>('/tools'));
                            notify('Tools checked');
                          })
                        }
                      >
                        <Wrench size={15} />
                        Check installation
                      </button>
                    </div>
                    <section className="panel">
                      {tools.map((t) => (
                        <div className="tool-row" key={t.name}>
                          <Terminal size={24} />
                          <span>
                            <strong>{t.name}</strong>
                            <small>{t.version || 'Version unavailable'}</small>
                            <code>
                              {t.path || 'Install this tool using your system package manager'}
                            </code>
                          </span>
                          <span className={'badge ' + (t.installed ? 'success' : 'warning')}>
                            {t.installed ? 'Installed' : 'Missing'}
                          </span>
                        </div>
                      ))}
                      <p className="muted">
                        Tools are detected from your system. ProjectDiscovery httpx may be installed
                        as httpx-toolkit on Kali. No tools run automatically.
                      </p>
                    </section>
                  </div>
                )}
                {detail && page in knowledgeKinds && (
                  <Suspense fallback={<div className="loading">Loading workspace…</div>}>
                    <Knowledge
                      key={detail.project.id + page + (knowledgeSeed?.nonce || '')}
                      detail={detail}
                      kind={knowledgeKinds[page as keyof typeof knowledgeKinds]}
                      nodeId={knowledgeSeed?.nodeId}
                      focusId={knowledgeSeed?.recordId}
                      onNode={(id) => {
                        setPage('Network Graph');
                        setSelected(id);
                      }}
                      onScan={(id) => {
                        setScanId(id);
                        setTab('Terminal Output');
                        setBottom(true);
                      }}
                      onChanged={() => refresh(detail.project.id)}
                    />
                  </Suspense>
                )}
                {detail && page === 'Credentials Vault' && (
                  <Suspense fallback={<div className="loading">Loading vault…</div>}>
                    <Vault
                      key={detail.project.id}
                      detail={detail}
                      onNode={(id) => {
                        setPage('Network Graph');
                        setSelected(id);
                      }}
                    />
                  </Suspense>
                )}
                {detail && page === 'Evidence' && (
                  <Suspense fallback={<div className="loading">Loading evidence…</div>}>
                    <Evidence
                      key={detail.project.id + (evidenceFocus || '')}
                      pid={detail.project.id}
                      focusId={evidenceFocus}
                    />
                  </Suspense>
                )}
                {detail && page === 'Timeline' && (
                  <Timeline key={detail.project.id} pid={detail.project.id} />
                )}
                {detail && page === 'Project search' && (
                  <ProjectSearch
                    key={detail.project.id}
                    pid={detail.project.id}
                    onOpen={openSearchResult}
                  />
                )}
                {page === 'Settings' && (
                  <div className="page">
                    <div className="page-heading">
                      <div>
                        <h1>Environment settings</h1>
                        <p>Predictable defaults for a small, local workstation.</p>
                      </div>
                    </div>
                    <Preferences appearance={appearance} onAppearance={setAppearance} />
                    <ReconSettings />
                    <section className="panel settings">
                      {[
                        ['Storage', 'XDG data directory · SQLite with migrations'],
                        ['Local API', 'Loopback only · per-session bearer authentication'],
                        ['Queue limits', '1–3 concurrent tasks · 32 queued/running maximum'],
                        [
                          'Scan limits',
                          'Single IPv4 or IPv4 web origin · profile-specific ports and rates',
                        ],
                        ['Timeout', '10–900s according to profile'],
                        ['Output', '64 KiB terminal tail · 16 MiB XML cap'],
                        [
                          'Evidence retention',
                          'Successful XML/JSON is retained until removed outside the app',
                        ],
                        [
                          'Investigation workspace',
                          'Notes, Findings, manual Attack Paths and encrypted Credentials Vault',
                        ],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <strong>{k}</strong>
                          <span>{v}</span>
                        </div>
                      ))}
                    </section>
                  </div>
                )}
                {error && !detail && (
                  <button className="retry" onClick={() => void initialize()}>
                    Retry connection
                  </button>
                )}
              </>
            )}
          </main>
          {(object || selectedEdge) && (
            <aside className="inspector">
              <div className="inspector-title">
                <span>INSPECTOR</span>
                <button
                  className="icon-button"
                  aria-label="Close inspector"
                  onClick={() => setSelected(null)}
                >
                  <X size={16} />
                </button>
              </div>
              {object && (
                <>
                  <div className="inspector-hero">
                    <div className={'empty-icon ' + object.kind}>
                      {object.kind === 'host' ? (
                        <Server />
                      ) : object.kind === 'service' || object.kind === 'url' ? (
                        <Globe />
                      ) : (
                        <Pentagon />
                      )}
                    </div>
                    <span className="eyebrow">{object.kind}</span>
                    <h2>{object.label}</h2>
                    <span className={'badge ' + (object.kind === 'custom' ? 'warning' : 'success')}>
                      {object.kind === 'custom'
                        ? 'Manual · ' + String(object.attrs.status || 'idea')
                        : 'Observed · ' + String(object.attrs.source || 'nmap')}
                    </span>
                  </div>
                  {object.kind === 'custom' && (
                    <CustomObjectDetails
                      key={object.id}
                      node={object}
                      onSave={async (content) => {
                        await api(
                          '/projects/' + pid + '/nodes/' + encodeURIComponent(object.id),
                          'PUT',
                          content,
                        );
                        await refresh(pid!);
                        notify('Object updated');
                      }}
                    />
                  )}
                  {object.kind !== 'custom' && (
                    <div className="inspector-section">
                      <h3>Attributes</h3>
                      {Object.entries(object.attrs)
                        .filter(
                          ([k]) =>
                            ![
                              'evidence_xml',
                              'evidence_json',
                              'scan_id',
                              'observations',
                              'evidence_truncated',
                            ].includes(k),
                        )
                        .map(([k, v]) => (
                          <div className="attribute" key={k}>
                            <span>{k}</span>
                            <strong>{String(v) || '—'}</strong>
                          </div>
                        ))}
                    </div>
                  )}
                  <PositionEditor
                    key={object.id + ':' + object.x + ':' + object.y}
                    node={object}
                    onSave={async (x, y) => {
                      await api(
                        '/projects/' +
                          pid +
                          '/nodes/' +
                          encodeURIComponent(object.id) +
                          '/position',
                        'PUT',
                        { x, y },
                      );
                      await refresh(pid!);
                      notify('Position updated');
                    }}
                  />
                  <div className="inspector-section">
                    <h3>Related objects</h3>
                    {detail?.edges
                      .filter((e) => e.source === object.id || e.target === object.id)
                      .map((e) => {
                        const n = detail.nodes.find(
                          (n) => n.id === (e.source === object.id ? e.target : e.source),
                        );
                        return (
                          <button
                            className="related"
                            key={e.id}
                            onClick={() => setSelected(n?.id || null)}
                          >
                            <Network size={14} />
                            {n?.label}
                            <ChevronRight size={13} />
                          </button>
                        );
                      })}
                  </div>
                  <div className="inspector-section">
                    <h3>Investigation</h3>
                    <div className="linked-items">
                      <button
                        onClick={() => {
                          setKnowledgeSeed({ nodeId: object.id, nonce: Date.now() });
                          setSelected(null);
                          setPage('Notes');
                        }}
                      >
                        Add linked note
                      </button>
                      <button
                        onClick={() => {
                          setKnowledgeSeed({ nodeId: object.id, nonce: Date.now() });
                          setSelected(null);
                          setPage('Findings');
                        }}
                      >
                        Add linked finding
                      </button>
                    </div>
                  </div>
                  {pid && (
                    <Suggestions
                      pid={pid}
                      nodeId={object.id}
                      revision={detail?.project.updated || ''}
                      onChoose={(profile, destination, nodeId) => {
                        setServiceNode(nodeId);
                        setProfileId(profile);
                        setTarget(destination);
                        setModal('scan');
                      }}
                    />
                  )}
                  {object.attrs.evidence_json != null && (
                    <div className="inspector-section">
                      <h3>Source evidence · JSON</h3>
                      {object.attrs.evidence_truncated === true && (
                        <p className="muted">
                          Preview truncated. Export the full scan evidence below.
                        </p>
                      )}
                      <p className="muted">Scan {String(object.attrs.scan_id)}</p>
                      <pre className="evidence">{String(object.attrs.evidence_json)}</pre>
                      <button
                        onClick={() =>
                          void perform(async () => {
                            const path = await saveArtifact(String(object.attrs.scan_id), 'json');
                            notify('Evidence saved: ' + path);
                          })
                        }
                      >
                        Export source JSON
                      </button>
                    </div>
                  )}
                  {Array.isArray(object.attrs.observations) && (
                    <div className="inspector-section">
                      <h3>Recent observations</h3>
                      {(
                        object.attrs.observations as {
                          scan_id: string;
                          tool: string;
                          observed_at: string;
                        }[]
                      ).map((observation) => (
                        <p key={observation.scan_id}>
                          {observation.tool} · {date(observation.observed_at)}
                        </p>
                      ))}
                    </div>
                  )}
                  {object.attrs.evidence_xml != null && (
                    <div className="inspector-section">
                      <h3>Source evidence</h3>
                      <p className="muted">Scan {String(object.attrs.scan_id)}</p>
                      <pre className="evidence">{String(object.attrs.evidence_xml)}</pre>
                      <button
                        onClick={() =>
                          void perform(async () => {
                            const path = await saveArtifact(String(object.attrs.scan_id));
                            notify('Evidence saved: ' + path);
                          })
                        }
                      >
                        <ArrowDownToLine size={14} />
                        Export source XML
                      </button>
                    </div>
                  )}
                  {object.kind === 'custom' && (
                    <div className="inspector-section">
                      <button className="danger-button" onClick={() => void removeNode(object)}>
                        Delete custom node
                      </button>
                    </div>
                  )}
                </>
              )}
              {selectedEdge && (
                <div className="inspector-section">
                  <h2>{selectedEdge.kind}</h2>
                  <span className={'badge ' + (selectedEdge.evidence ? 'success' : 'warning')}>
                    {selectedEdge.evidence ? 'Observed' : 'Manual hypothesis'}
                  </span>
                  <p>Source: {detail?.nodes.find((n) => n.id === selectedEdge.source)?.label}</p>
                  <p>Target: {detail?.nodes.find((n) => n.id === selectedEdge.target)?.label}</p>
                  {!selectedEdge.evidence && (
                    <RelationshipEditor
                      key={selectedEdge.id}
                      label={selectedEdge.kind}
                      onSave={async (kind) => {
                        await api(
                          '/projects/' + pid + '/edges/' + encodeURIComponent(selectedEdge.id),
                          'PUT',
                          { kind },
                        );
                        await refresh(pid!);
                        notify('Relationship updated');
                      }}
                    />
                  )}
                  {!selectedEdge.evidence && (
                    <button
                      className="danger-button"
                      onClick={() => {
                        if (window.confirm('Delete manual relationship?'))
                          void perform(async () => {
                            await api(
                              '/projects/' + pid + '/edges/' + encodeURIComponent(selectedEdge.id),
                              'DELETE',
                            );
                            setSelected(null);
                            await refresh(pid!);
                          });
                      }}
                    >
                      Delete relationship
                    </button>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
        <section className={'bottom-panel ' + (!bottom ? 'collapsed' : '')}>
          <div className="bottom-tabs">
            {['Terminal Output', 'Running Tasks', 'Logs', 'Events'].map((t) => (
              <button
                key={t}
                className={tab === t ? 'active' : ''}
                onClick={() => {
                  setTab(t);
                  setBottom(true);
                }}
              >
                {t === 'Terminal Output' && <Terminal size={13} />}
                {t}
                {t === 'Running Tasks' && running > 0 && <span className="count">{running}</span>}
              </button>
            ))}
            <button
              className="collapse"
              onClick={() => setBottom(!bottom)}
              aria-label={bottom ? 'Collapse task panel' : 'Expand task panel'}
            >
              <ChevronDown size={16} style={{ transform: bottom ? undefined : 'rotate(180deg)' }} />
            </button>
          </div>
          {bottom && (
            <div className="bottom-content">
              {tab === 'Terminal Output' ? (
                <>
                  <div className="terminal-heading">
                    <span>
                      {scan ? (
                        <>
                          {scan.tool || 'nmap'} <span className="mono">{scan.target}</span>
                          <span className="badge">{scan.status}</span> ·{' '}
                          {Math.max(
                            0,
                            Math.round(
                              (new Date(scan.ended || Date.now()).getTime() -
                                new Date(scan.started).getTime()) /
                                1000,
                            ),
                          )}
                          s
                        </>
                      ) : (
                        'No scan selected'
                      )}
                    </span>
                    {scan?.status === 'completed' && (
                      <button
                        onClick={() =>
                          void perform(async () => {
                            const path = await saveArtifact(
                              scan.id,
                              scan.tool && scan.tool !== 'nmap' ? 'json' : 'xml',
                            );
                            notify('Evidence saved: ' + path);
                          })
                        }
                      >
                        Export scan evidence
                      </button>
                    )}
                    {scan && active(scan) && (
                      <button
                        className="danger-button"
                        onClick={() =>
                          void perform(async () => {
                            await api('/scans/' + scan.id + '/cancel', 'POST');
                            if (pid) await refresh(pid);
                            notify('Scan cancelled');
                          })
                        }
                      >
                        <Square size={11} />
                        Stop scan
                      </button>
                    )}
                  </div>
                  <pre className="terminal">
                    {scan
                      ? (scan.command || []).join(' ') +
                        '\n\n' +
                        (scan.output || 'Waiting for tool output…') +
                        (scan.error ? '\n' + scan.error : '')
                      : 'Tool output will appear here when you start a scan. No shell session is running.'}
                  </pre>
                </>
              ) : tab === 'Running Tasks' ? (
                <div className="task-lines">
                  {detail?.scans.filter(active).map((s) => (
                    <div key={s.id}>
                      <LoaderCircle size={13} className="spin" />
                      {s.tool || 'nmap'} · {s.target}
                      <span>{s.status}</span>
                      <button
                        onClick={() =>
                          void perform(async () => {
                            await api('/scans/' + s.id + '/cancel', 'POST');
                            await refresh(pid!);
                          })
                        }
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                  {!running && <span className="muted">No running tasks.</span>}
                </div>
              ) : (
                <div className="event-lines">
                  {(tab === 'Logs'
                    ? detail?.scans
                        .filter((s) => s.error)
                        .map((s) => ({ id: s.id, created: s.ended || s.started, message: s.error }))
                    : detail?.events
                  )?.map((e) => (
                    <div key={e.id}>
                      <time>{date(e.created)}</time>
                      <span>{e.message}</span>
                    </div>
                  ))}
                  {((tab === 'Events' && !detail?.events.length) ||
                    (tab === 'Logs' && !detail?.scans.some((s) => s.error))) && (
                    <span className="muted">No {tab.toLowerCase()} to display.</span>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
        <footer className="statusbar">
          <span>
            <ShieldCheck size={12} />
            Private by design
          </span>
          <span>
            {current?.name || 'No project selected'}
            <i />
            SQLite · local storage
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {context && (
        <div
          className="context-menu"
          style={{
            left: Math.min(context.x, window.innerWidth - 210),
            top: Math.min(context.y, window.innerHeight - 120),
          }}
          onMouseLeave={() => setContext(null)}
        >
          <button
            onClick={() => {
              setSelected(context.id);
              setContext(null);
            }}
          >
            Inspect object
          </button>
          <button
            onClick={() => {
              setName('');
              setModal('node');
              setContext(null);
            }}
          >
            Add custom node
          </button>
          {detail?.nodes.find((n) => n.id === context.id)?.kind === 'custom' && (
            <button onClick={() => void removeNode(detail.nodes.find((n) => n.id === context.id)!)}>
              Delete custom node
            </button>
          )}
        </div>
      )}
      {modal === 'project' && (
        <Dialog title="Create a project" onClose={closeModal}>
          <form onSubmit={submitProject}>
            <p className="muted">A dedicated workspace for an authorized engagement.</p>
            <label>
              Project name
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="HTB Lab"
              />
            </label>
            <label>
              Description
              <textarea
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Scope, objectives and context"
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={closeModal}>
                Cancel
              </button>
              <button className="primary" disabled={busy || !name.trim()}>
                {busy ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}Create
                project
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'scan' && (
        <Dialog title="Start recon task" onClose={closeModal}>
          <ScanForm
            serviceNode={serviceNode}
            servicePort={
              Number(detail?.nodes.find((n) => n.id === serviceNode)?.attrs.port) || undefined
            }
            initialTarget={target}
            initialProfile={profileId}
            busy={busy}
            onSubmit={(request) => void submitScan(request)}
            onClose={closeModal}
          />
        </Dialog>
      )}
      {modal === 'node' && (
        <Dialog title="Add a custom object" onClose={closeModal}>
          <p className="muted">
            Describe an asset, note, hypothesis, task or reference. Connect objects using their
            handles.
          </p>
          <NodeEditor
            onCancel={closeModal}
            onSave={async (content) => {
              const node = await api<ObjectNode>('/projects/' + pid + '/nodes', 'POST', {
                ...content,
                x: 200,
                y: 450,
              });
              await refresh(pid!);
              setSelected(node.id);
              closeModal();
              notify('Custom object saved');
            }}
          />
        </Dialog>
      )}
      {modal === 'command' && (
        <Dialog title="Go to…" onClose={closeModal}>
          <div className="command-input">
            <Search size={18} />
            <input
              aria-label="Search commands"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pages, projects, objects, knowledge…"
              onKeyDown={(e) => {
                if (['ArrowDown', 'Enter'].includes(e.key)) {
                  e.preventDefault();
                  document.querySelector<HTMLButtonElement>('.commands button')?.focus();
                  if (e.key === 'Enter')
                    document.querySelector<HTMLButtonElement>('.commands button')?.click();
                }
              }}
            />
          </div>
          <div
            className="commands"
            onKeyDown={(e) => {
              const buttons = [
                ...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
              ];
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                buttons[
                  (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
                ]?.focus();
              }
            }}
          >
            {[
              { name: 'Create new project', action: newProject, enabled: true },
              { name: 'Add custom object', action: () => setModal('node'), enabled: Boolean(pid) },
              { name: 'Start recon scan', action: startScan, enabled: Boolean(pid) },
              {
                name: 'Toggle task panel',
                action: () => {
                  setBottom((v) => !v);
                  closeModal();
                },
                enabled: true,
              },
              {
                name: 'Lock credentials vault',
                action: () => {
                  void api('/vault/lock', 'POST')
                    .then(() => {
                      window.dispatchEvent(new Event('dragontrip:vault-locked'));
                      notify('Vault locked');
                    })
                    .catch((e) => setError(e.message));
                  closeModal();
                },
                enabled: true,
              },
            ]
              .filter(
                (item) => item.enabled && item.name.toLowerCase().includes(query.toLowerCase()),
              )
              .map((item) => (
                <button
                  key={item.name}
                  onClick={() => {
                    setQuery('');
                    item.action();
                  }}
                >
                  <Command size={16} />
                  {item.name}
                  <span>Action</span>
                </button>
              ))}
            {[...nav, ...knowledgeNav]
              .filter(([n]) => n.toLowerCase().includes(query.toLowerCase()))
              .map(([n, Icon]) => (
                <button
                  key={n}
                  onClick={() => {
                    setPage(n);
                    setModal(null);
                    setQuery('');
                  }}
                >
                  <Icon size={16} />
                  {n}
                  <ArrowRight size={14} />
                </button>
              ))}
            {projects
              .filter((p) => p.name.toLowerCase().includes(query.toLowerCase()))
              .slice(0, 10)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    openProject(p.id);
                    setModal(null);
                    setQuery('');
                  }}
                >
                  <Folder size={16} />
                  {p.name}
                  <span>Project</span>
                </button>
              ))}
            {detail?.nodes
              .filter((n) =>
                [
                  n.label,
                  n.kind,
                  n.attrs.title,
                  n.attrs.description,
                  n.attrs.category,
                  n.attrs.status,
                  JSON.stringify(n.attrs.tags || []),
                  JSON.stringify(n.attrs.technologies || []),
                ]
                  .join(' ')
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .slice(0, 20)
              .map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    setPage('Network Graph');
                    setSelected(n.id);
                    setModal(null);
                    setQuery('');
                  }}
                >
                  <Network size={16} />
                  {n.label}
                  <span>Object</span>
                </button>
              ))}
            {pid && query.trim() && (
              <SearchResults pid={pid} query={query} compact onOpen={openSearchResult} />
            )}
          </div>
        </Dialog>
      )}
    </div>
  );
}
