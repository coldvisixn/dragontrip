import { t as tr, useLocale, localeTag } from './i18n';
import { usePageTransition } from './motion';
import { BackgroundWork } from './BackgroundWork';
import { ScanForm, ReconSettings, Suggestions, ScanHistory } from './Recon';
import type { ScanRequest } from './api';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { downloadText } from './DraftStatus';
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
  Terminal,
  Command,
  PanelLeftClose,
  PanelLeftOpen,
  ListChecks,
  ClipboardList,
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
import { SourceActions, type LinkedRecord } from './SourceActions';
import { useNavigation } from './navigation';
import {
  readLocal,
  writeLocal,
  useProjectState,
  useMemoryOnlyDrafts,
  loadWorkspace,
  getWorkspace,
  putWorkspace,
  memoryDraftValues,
} from './workspace';
import {
  PrimaryNavigation,
  SettingsNavigation,
  SectionTabs,
  sectionFor,
  tabId,
  type WorkspacePage,
} from './WorkspaceNavigation';
import { ScopePage, ImportsPage, WebMap, Observations } from './Research';
import { Methodologies, Workflows } from './Methodologies';
const Tasks = lazy(() => import('./Tasks'));
const Reports = lazy(() => import('./Reporting'));
const ProjectOverview = lazy(() =>
  import('./Reporting').then((module) => ({ default: module.ProjectOverview })),
);
const Evidence = lazy(() => import('./Evidence'));
const Graph = lazy(() => import('./Graph'));
const Knowledge = lazy(() => import('./Knowledge'));
const Vault = lazy(() => import('./Vault'));
const knowledgeNav = [
  ['Methodologies', ListChecks],
  ['Recon workflows', Activity],
  ['Targets & scope', ShieldCheck],
  ['Import results', ArrowDownToLine],
  ['Web applications', Globe],
  ['Project overview', ClipboardList],
  ['Task board', ListChecks],
  ['Reports', FileText],
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
type Page = WorkspacePage;
const active = (s: Scan) => s.status === 'running' || s.status === 'queued';
const date = (s: string) => new Date(s).toLocaleString(localeTag());
function Empty({
  icon = Network,
  title,
  children,
}: {
  icon?: typeof Network;
  title: string;
  children: ReactNode;
}) {
  useLocale();
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
  useLocale();
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
          <button className="icon-button" onClick={onClose} aria-label={tr('Close dialog')}>
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export default function App() {
  const locale = useLocale();
  const [pid, setPid] = useState<string | null>(() => readLocal('dragontrip.project'));
  const memoryDrafts = useMemoryOnlyDrafts();
  const {
    page,
    navigate: navigatePage,
    back,
    forward,
    canBack,
    canForward,
  } = useNavigation<Page>(pid ? 'Network Graph' : 'Dashboard', pid || 'global');
  const [appearance, setAppearance] = useAppearance();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => readLocal('dragontrip.sidebarCollapsed') === 'true',
  );
  const [rememberedSections, setRememberedSections] = useProjectState<
    Partial<Record<string, WorkspacePage>>
  >(pid || 'global', 'sections', {});
  const setPage = useCallback(
    (destination: Page) => {
      const section = sectionFor(destination);
      if (section)
        setRememberedSections((old) =>
          old[section.id] === destination ? old : { ...old, [section.id]: destination },
        );
      navigatePage(destination);
    },
    [navigatePage, setRememberedSections],
  );
  const activeSection = sectionFor(page);
  useEffect(() => {
    let live = true;
    void loadWorkspace(pid || 'global').then(() => {
      const navigation = getWorkspace(pid || 'global', 'navigation', { entries: [page], index: 0 });
      if (live && activeSection && navigation.entries[navigation.index] === page)
        setRememberedSections((old) =>
          old[activeSection.id] === page ? old : { ...old, [activeSection.id]: page },
        );
    });
    return () => {
      live = false;
    };
  }, [pid, page, activeSection, setRememberedSections]);
  useEffect(() => {
    writeLocal('dragontrip.sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);
  const [knowledgeSeed, setKnowledgeSeed] = useState<{
    nodeId?: string;
    recordId?: string;
    nonce: number;
  }>();
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectDetail, setDetail] = useState<Detail | null>(null);
  const detail = projectDetail?.project.id === pid ? projectDetail : null;
  const [evidenceFocus, setEvidenceFocus] = useProjectState<string | undefined>(
    pid || 'global',
    'evidence_focus',
    undefined,
  );
  const [observationFocus, setObservationFocus] = useProjectState<
    { observation_id: string; node_id?: string } | undefined
  >(pid || 'global', 'observation_focus', undefined);
  const [inspected, setInspected] = useState<ObjectNode | null>(null);
  const [tools, setTools] = useState<Tool[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [loading, setLoading] = useState(true);
  const mainRef = usePageTransition(page, pid, loading);
  const [busy, setBusy] = useState(false);
  const performing = useRef(false);
  const [selected, setSelectedValue] = useProjectState<string | null>(
    pid || 'global',
    'selected_node',
    null,
  );
  const [inspectorHidden, setInspectorHidden] = useProjectState(
    pid || 'global',
    'inspector_hidden',
    false,
  );
  const setSelected = useCallback(
    (value: string | null) => {
      setSelectedValue(value);
      setInspectorHidden(false);
    },
    [setSelectedValue, setInspectorHidden],
  );
  type Modal = 'project' | 'scan' | 'node' | 'command' | null;
  const [transientModal, setTransientModal] = useState<Modal>(null);
  const [nodeCreatorOpen, setNodeCreatorOpen] = useProjectState(
    pid || 'global',
    'object_creator_open',
    false,
  );
  const modal: Modal = transientModal || (nodeCreatorOpen ? 'node' : null);
  const setModal = useCallback(
    (value: Modal | ((old: Modal) => Modal)) => {
      const next =
        typeof value === 'function'
          ? value(transientModal || (nodeCreatorOpen ? 'node' : null))
          : value;
      setNodeCreatorOpen(next === 'node');
      setTransientModal(next === 'node' ? null : next);
    },
    [transientModal, nodeCreatorOpen, setNodeCreatorOpen],
  );
  const closeModal = useCallback(() => {
    setNodeCreatorOpen(false);
    setTransientModal(null);
  }, [setNodeCreatorOpen]);
  const [closeWarning, setCloseWarning] = useState(false);
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    void invoke('set_close_guard', { unsafeWork: memoryDrafts > 0 }).catch(() => {});
  }, [memoryDrafts]);
  useEffect(() => {
    if (!('__TAURI_INTERNALS__' in window)) return;
    let disposed = false;
    const pending = listen('dragontrip:close-requested', () => setCloseWarning(true));
    void pending
      .then((unlisten) => {
        if (disposed) unlisten();
      })
      .catch(() => {});
    return () => {
      disposed = true;
      void pending.then((unlisten) => unlisten()).catch(() => {});
    };
  }, []);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [goal, setGoal] = useState('');
  const [scanError, setScanError] = useState('');
  const scanSubmitting = useRef(false);
  const [target, setTarget] = useState('');
  const [profileId, setProfileId] = useState('quick');
  const [serviceNode, setServiceNode] = useState<string | undefined>();
  const [query, setQuery] = useState('');
  const [graphQuery, setGraphQuery] = useProjectState(pid || 'global', 'graph_query', '');
  const [nodeKind, setNodeKind] = useProjectState(pid || 'global', 'nodeKind', 'all');
  const [bottom, setBottom] = useProjectState(pid || 'global', 'job_panel_open', false);
  const [scanId, setScanId] = useProjectState<string | null>(
    pid || 'global',
    'selected_scan',
    null,
  );
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
  const hasActiveScan = (detail?.background_active || detail?.scans.some(active)) ?? false;
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
  const refreshSequence = useRef(0);
  const refresh = useCallback(async (id: string) => {
    const expected = generation.current;
    const sequence = ++refreshSequence.current;
    const d = await api<Detail>('/projects/' + id + '?compact=true');
    if (
      sequence === refreshSequence.current &&
      expected === generation.current &&
      activeProject.current === id
    )
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
    setScan(null);
    setInspected(null);
    setTransientModal(null);
    setKnowledgeSeed(undefined);
    setError('');
    setScanError('');
    setContext(null);
    if (pid) {
      writeLocal('dragontrip.project', pid);
      void refresh(pid).catch((e) => {
        if (activeProject.current === pid) setError(e.message);
      });
    }
  }, [pid, refresh]);
  useEffect(() => {
    if (!pid || !hasActiveScan) return;
    const timer = setInterval(() => {
      void refresh(pid)
        .then(() => {
          void refreshProjects();
        })
        .catch((e) => {
          if (activeProject.current === pid) setError(e.message);
        });
    }, 2000);
    return () => clearInterval(timer);
  }, [pid, refresh, refreshProjects, hasActiveScan]);
  useEffect(() => {
    if (!detail || detail.project.id !== pid || !selected) return;
    if (
      !detail.nodes.some((n) => n.id === selected) &&
      !detail.edges.some((e) => e.id === selected)
    ) {
      setSelected(null);
      setToast(
        tr('The previously selected object was deleted. Choose another object to continue.'),
      );
    }
  }, [detail, pid, selected, setSelected]);
  const viewedScan = scanId || detail?.scans[0]?.id;
  useEffect(() => {
    setScan(null);
    if (!viewedScan) return;
    let disposed = false;
    let sequence = 0;
    const update = () => {
      const expected = ++sequence;
      return api<Scan>('/scans/' + viewedScan)
        .then((s) => {
          if (!disposed && expected === sequence) {
            setScan(s);
            if (!active(s)) clearInterval(timer);
          }
        })
        .catch((e) => {
          if (!disposed && expected === sequence) setError(e.message);
        });
    };
    update();
    const timer = setInterval(update, 1500);
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
    document.documentElement.lang = locale;
    document.title = `${tr(page)} · Dragontrip`;
    if (!modal && !document.activeElement?.matches('input,textarea,select,[role="tab"]'))
      document.querySelector<HTMLElement>('.main')?.focus({ preventScroll: true });
  }, [page, locale]);
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
  useEffect(() => {
    const record = (event: Event) => {
      const row = (event as CustomEvent<LinkedRecord>).detail;
      setKnowledgeSeed({ recordId: row.id, nonce: Date.now() });
      setPage(
        row.kind === 'task'
          ? 'Task board'
          : row.kind === 'finding'
            ? 'Findings'
            : row.kind === 'path'
              ? 'Attack Paths'
              : 'Notes',
      );
    };
    const source = (event: Event) => {
      const { kind, id, node_id } = (
        event as CustomEvent<{ kind: string; id: string; node_id?: string }>
      ).detail;
      if (kind === 'observation') {
        setObservationFocus({ observation_id: id, node_id });
        setSelected(node_id || null);
        setPage('Network Graph');
        setNodeKind('all');
      } else if (kind === 'node') {
        setPage('Network Graph');
        setSelected(id);
        setNodeKind('all');
      } else if (kind === 'scan') {
        setScanId(id);
        setPage('Scans');
        setBottom(true);
      } else
        void api<LinkedRecord>(`/projects/${pid}/knowledge/${id}`)
          .then((row) => {
            if (activeProject.current === pid)
              record(new CustomEvent('dragontrip:record', { detail: row }));
          })
          .catch((e) => setError(e.message));
    };
    window.addEventListener('dragontrip:record', record);
    window.addEventListener('dragontrip:source', source);
    return () => {
      window.removeEventListener('dragontrip:record', record);
      window.removeEventListener('dragontrip:source', source);
    };
  }, [pid, setPage, setSelected, setNodeKind, setScanId]);
  async function perform(action: () => Promise<void>) {
    if (performing.current) return;
    performing.current = true;
    const projectId = activeProject.current;
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (e) {
      if (activeProject.current === projectId) setError((e as Error).message);
    } finally {
      performing.current = false;
      setBusy(false);
    }
  }
  const projectOpenSequence = useRef(0);
  async function openProject(id: string, preferred?: Page) {
    const sequence = ++projectOpenSequence.current;
    await loadWorkspace(id);
    if (sequence !== projectOpenSequence.current) return;
    const history = getWorkspace<{ entries: Page[]; index: number }>(id, 'navigation', {
      entries: ['Network Graph'],
      index: 0,
    });
    const destination =
      preferred ||
      history.entries
        .slice(0, history.index + 1)
        .reverse()
        .find((p) => !['Projects', 'Dashboard'].includes(p)) ||
      'Network Graph';
    if (id === pid) setPage(destination);
    else {
      putWorkspace(id, 'navigation', {
        entries: [...history.entries.slice(0, history.index + 1), destination].slice(-100),
        index: Math.min(history.index + 1, 99),
      });
      setPid(id);
    }
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
        item.subtype === 'task'
          ? 'Task board'
          : item.subtype === 'finding'
            ? 'Findings'
            : item.subtype === 'path'
              ? 'Attack Paths'
              : 'Notes',
      );
    } else if (item.kind === 'scan') {
      setPage('Scans');
      setScanId(item.id);
      setBottom(true);
    } else if (item.kind === 'attachment') {
      setEvidenceFocus(item.id);
      setPage('Evidence');
    } else setPage('Timeline');
  }
  function newProject() {
    setName('');
    setDescription('');
    setGoal('');
    setModal('project');
  }
  function startScan() {
    setScanError('');
    setTarget(detail?.scope_targets?.find((value) => /^\d+\.\d+\.\d+\.\d+$/.test(value)) || '');
    setProfileId('quick');
    setServiceNode(undefined);
    setModal('scan');
  }
  async function submitProject(e: FormEvent) {
    e.preventDefault();
    await perform(async () => {
      const p = await api<Project>('/projects', 'POST', { name, description, goal });
      await refreshProjects();
      await openProject(p.id, 'Project overview');
      setModal(null);
      notify(tr('Project created'));
    });
  }
  async function submitScan(request: ScanRequest) {
    if (!pid || scanSubmitting.current) return;
    const projectId = pid;
    scanSubmitting.current = true;
    setBusy(true);
    setScanError('');
    try {
      const saved = await api<Scan>('/projects/' + projectId + '/scans', 'POST', request);
      if (activeProject.current !== projectId) return;
      setScanId(saved.id);
      setScan(saved);
      setBottom(false);
      setModal(null);
      notify(tr('Recon queued. Follow progress in Background work; you can keep working.'));
      await refresh(projectId).catch(() =>
        setError(tr('Scan queued. Refresh failed; reopen the project to see progress.')),
      );
    } catch (e) {
      if (activeProject.current === projectId) setScanError((e as Error).message);
    } finally {
      scanSubmitting.current = false;
      setBusy(false);
    }
  }
  async function openWebResearch(node: ObjectNode) {
    if (!pid) return;
    const projectId = pid;
    await perform(async () => {
      const context = await api<{ application: ObjectNode; selected_node: string | null }>(
        `/projects/${projectId}/nodes/${encodeURIComponent(node.id)}/web-context`,
        'POST',
      );
      if (activeProject.current !== projectId) return;
      await refresh(projectId);
      if (activeProject.current !== projectId) return;
      putWorkspace(projectId, 'web_origin', String(context.application.attrs.origin));
      putWorkspace(projectId, 'web_node', context.selected_node || '');
      setPage('Web applications');
    });
  }
  async function removeNode(n: ObjectNode) {
    if (!pid || !window.confirm(tr('Delete custom node and its manual relationships?'))) return;
    await perform(async () => {
      await api('/projects/' + pid + '/nodes/' + encodeURIComponent(n.id), 'DELETE');
      setSelected(null);
      setContext(null);
      await refresh(pid);
      notify(tr('Custom node deleted'));
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
          <p>{p.description || tr('Local security workspace')}</p>
          <footer>
            <span className="dot green" />
            {tr('Saved locally')}
            <span>{new Date(p.updated).toLocaleDateString(localeTag())}</span>
          </footer>
        </button>
      ))}
      <button className="project-card new-card" onClick={newProject}>
        <Plus size={24} />
        <strong>{tr('Create a project')}</strong>
        <span>{tr('A clean workspace for your next engagement')}</span>
      </button>
    </div>
  );
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        {tr('Skip to content')}
      </a>
      <aside className={'sidebar' + (sidebarCollapsed ? ' collapsed' : '')}>
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
            DRAGONTRIP<small>{tr('SECURITY WORKSPACE')}</small>
          </span>
        </div>
        <button
          aria-label={tr('Choose project')}
          title={tr('Choose project')}
          className="workspace-switch"
          onClick={() => setPage('Projects')}
        >
          <div className="avatar">P</div>
          <span>
            {current?.name || tr('Choose a project')}
            <small>{tr('Projects · local workspace')}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <button
          className="search-button"
          aria-label={tr('Quick search')}
          title={tr('Quick search (Ctrl+K)')}
          onClick={() => {
            setQuery('');
            setModal('command');
          }}
        >
          <Search size={15} />
          <span className="navigation-label">{tr('Quick search')}</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="sidebar-navigation">
          <PrimaryNavigation
            page={page}
            hasProject={Boolean(pid)}
            running={running}
            remembered={rememberedSections}
            onNavigate={(destination) => {
              setPage(destination);
            }}
          />
          <SectionTabs
            page={page}
            onNavigate={(destination) => {
              setPage(destination);
            }}
          />
        </div>
        <div className="sidebar-bottom">
          <SettingsNavigation page={page} remembered={rememberedSections} onNavigate={setPage} />
          <button
            className="sidebar-toggle"
            aria-label={sidebarCollapsed ? tr('Expand sidebar') : tr('Collapse sidebar')}
            title={sidebarCollapsed ? tr('Expand sidebar') : tr('Collapse sidebar')}
            aria-expanded={!sidebarCollapsed}
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
            <span className="navigation-label">
              {sidebarCollapsed ? tr('Expand sidebar') : tr('Collapse sidebar')}
            </span>
          </button>
          <div className="local-status">
            <span className="dot green" />
            <span>
              {tr('Local environment')}
              <small>
                {tr('Dragontrip ')}
                {packageInfo.version}
              </small>
            </span>
            <ShieldCheck size={16} />
          </div>
        </div>
      </aside>
      <div className="workspace">
        {memoryDrafts > 0 && (
          <p role="alert" className="form-error memory-warning">
            {memoryDrafts}
            {tr(
              ' draft(s) exist only in memory. Reopen the editor and retry sync or download the draft before closing Dragontrip.',
            )}
          </p>
        )}
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button"
              aria-label={tr('Go back')}
              disabled={!canBack}
              onClick={back}
            >
              <ArrowLeft size={15} />
            </button>
            <button
              className="icon-button"
              aria-label={tr('Go forward')}
              disabled={!canForward}
              onClick={forward}
            >
              <ArrowRight size={15} />
            </button>
            <span title={current?.name}>{current?.name || tr('Workspace')}</span>
            <ChevronRight size={13} />
            <strong>{tr(page)}</strong>
          </div>
          <div className="top-actions">
            {current && (
              <button
                className="goal-context"
                title={current.goal || tr('Set an investigation goal')}
                onClick={() => setPage('Project overview')}
              >
                {current.goal ? tr('Goal: ') + current.goal : tr('Set investigation goal')}
              </button>
            )}
          </div>
        </header>
        {error && (
          <div className="error-banner" role="alert">
            {tr(error)}
            <button onClick={() => setError('')} aria-label={tr('Dismiss error')}>
              <X size={15} />
            </button>
          </div>
        )}
        <div
          className="workspace-body"
          id="workspace-section-panel"
          role={activeSection && activeSection.pages.length > 1 ? 'tabpanel' : undefined}
          aria-labelledby={
            activeSection && activeSection.pages.length > 1 ? tabId(page) : undefined
          }
        >
          <main
            ref={mainRef}
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
                      {tr('YOUR LOCAL COMMAND CENTER')}
                    </div>
                    <div className="page-heading">
                      <div>
                        <h1>{tr('Workspace overview')}</h1>
                        <p>{tr('A clear view of your engagements. Every discovery, connected.')}</p>
                      </div>
                      <button className="primary" onClick={newProject}>
                        <Plus size={16} />
                        {tr('New project')}
                      </button>
                    </div>
                    {projects.length > 0 && (
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
                                <span>{tr(String(label))}</span>
                                <I size={17} />
                              </div>
                              <strong>{String(value)}</strong>
                              <small>{tr(String(hint))}</small>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="section-heading">
                      <h2>
                        {tr('Your projects ')}
                        <span>{projects.length}</span>
                      </h2>
                      <button className="text-button" onClick={() => setPage('Projects')}>
                        {tr('View all')}
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    {projectCards}
                    <section className="panel start-project" style={{ marginTop: 20 }}>
                      <h2>{tr('Explore Dragontrip in a minute')}</h2>
                      <p>
                        {tr(
                          'Create a separate project with fictional objects, a draft finding and a task. No scans run.',
                        )}
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            const example = await api<Project>('/examples', 'POST');
                            await refreshProjects();
                            openProject(example.id);
                            notify(tr('Fictional demo created · no scans launched'));
                          })
                        }
                      >
                        {tr('Create fictional demo')}
                      </button>
                    </section>
                    <ProjectTransfer
                      project={current}
                      onImported={async (value) => {
                        await refreshProjects();
                        openProject(value.id);
                        notify(tr('Project imported'));
                      }}
                    />
                    <div className="dashboard-columns">
                      <section className="panel">
                        <div className="section-heading">
                          <h2>{tr('Recent activity')}</h2>
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
                          <div className="quiet-empty">
                            {tr('Your project activity will appear here.')}
                          </div>
                        )}
                      </section>
                      <section className="panel">
                        <div className="section-heading">
                          <h2>{tr('Environment')}</h2>
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
                                {t.version || t.path || tr('Install the system nmap package')}
                              </small>
                            </span>
                            <span className={'badge ' + (t.installed ? 'success' : 'warning')}>
                              {t.installed ? tr('Installed') : tr('Not installed')}
                            </span>
                          </div>
                        ))}
                        <div className="hint">
                          <ShieldCheck size={16} />
                          {tr('Scans run locally. Your data stays on this device.')}
                        </div>
                      </section>
                    </div>
                    {current && (
                      <button className="resume" onClick={() => setPage('Network Graph')}>
                        <Network size={20} />
                        <span>
                          {tr('Continue ')}
                          {current.name}
                          <small>{tr('Open the saved network graph')}</small>
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
                        <h1>{tr('Projects')}</h1>
                        <p>{tr('Separate engagements. A persistent place for every discovery.')}</p>
                      </div>
                      <button className="primary" onClick={newProject}>
                        <Plus size={16} />
                        {tr('New project')}
                      </button>
                    </div>
                    {projectCards}
                    <section className="panel start-project" style={{ marginTop: 20 }}>
                      <h2>{tr('Explore Dragontrip in a minute')}</h2>
                      <p>
                        {tr(
                          'Create a separate project with fictional objects, a draft finding and a task. No scans run.',
                        )}
                      </p>
                      <button
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            const example = await api<Project>('/examples', 'POST');
                            await refreshProjects();
                            openProject(example.id);
                            notify(tr('Fictional demo created · no scans launched'));
                          })
                        }
                      >
                        {tr('Create fictional demo')}
                      </button>
                    </section>
                    <ProjectTransfer
                      project={current}
                      onImported={async (value) => {
                        await refreshProjects();
                        openProject(value.id);
                        notify(tr('Project imported'));
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
                    <Empty title={tr('Choose your workspace')} icon={Folder}>
                      {tr('Open a project or')}{' '}
                      <button className="text-button" onClick={newProject}>
                        {tr('create a new one')}
                      </button>{' '}
                      {tr('to get started.')}
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
                      {tr('Loading project…')}
                    </div>
                  )}
                {page === 'Network Graph' && detail && (
                  <>
                    <div className="graph-toolbar">
                      <div>
                        <Network size={18} />
                        <strong>{tr('Network Graph')}</strong>
                        <span className="badge">
                          {detail.nodes.length}
                          {tr(' objects · ')}
                          {detail.edges.length}
                          {tr(' links')}
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
                          {tr('Custom node')}
                        </button>
                        <button className="primary" onClick={startScan}>
                          <Play size={13} />
                          {tr('Start scan')}
                        </button>
                      </div>
                    </div>
                    <div className="graph-scope-hint">
                      {object ? (
                        <>
                          <span title={object.label}>
                            {tr('Selected: ')}
                            {object.label}
                          </span>
                          <button onClick={() => setInspectorHidden(!inspectorHidden)}>
                            {inspectorHidden ? tr('Show inspector') : tr('Hide inspector')}
                          </button>
                        </>
                      ) : (
                        tr('Select an object to inspect evidence and plan the next check.')
                      )}
                    </div>
                    <div className="graph-search">
                      <Search size={14} />
                      <input
                        aria-label={tr('Find graph object')}
                        placeholder={tr('Find an object…')}
                        value={graphQuery}
                        onChange={(e) => setGraphQuery(e.target.value)}
                      />
                      <select
                        aria-label={tr('Graph object type')}
                        value={nodeKind}
                        onChange={(e) => setNodeKind(e.target.value)}
                      >
                        {[
                          'all',
                          'host',
                          'service',
                          'url',
                          'domain',
                          'application',
                          'endpoint',
                          'custom',
                        ].map((kind) => (
                          <option key={kind} value={kind}>
                            {kind === 'all' ? tr('All types') : tr(kind)}
                          </option>
                        ))}
                      </select>
                      {graphQuery && (
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
                                .includes(graphQuery.toLowerCase()),
                            )
                            .slice(0, 20)
                            .map((n) => (
                              <button
                                key={n.id}
                                onClick={() => {
                                  setNodeKind('all');
                                  setSelected(n.id);
                                  setGraphQuery('');
                                }}
                              >
                                {n.label}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    <div className="graph-area">
                      <Suspense fallback={<div className="loading">{tr('Loading graph…')}</div>}>
                        <Graph
                          key={detail.project.id}
                          projectId={detail.project.id}
                          detailMode={appearance.graph_detail}
                          performanceProfile={appearance.performance_profile}
                          theme={appearance.theme === 'system' ? undefined : appearance.theme}
                          selectedId={selected}
                          objects={detail.nodes.filter((n) =>
                            nodeKind === 'all'
                              ? n.kind !== 'endpoint' || n.id === selected
                              : n.kind === nodeKind,
                          )}
                          relations={detail.edges.filter((edge) =>
                            nodeKind === 'all'
                              ? [edge.source, edge.target].every(
                                  (id) => nodeMap.get(id)?.kind !== 'endpoint' || id === selected,
                                )
                              : [edge.source, edge.target].every(
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
                              .catch((e) => setError(tr('Position was not saved: ') + e.message));
                          }}
                          onConnect={(c) => {
                            if (c.source && c.target)
                              void perform(async () => {
                                await api('/projects/' + pid + '/edges', 'POST', c);
                                await refresh(pid!);
                                notify(tr('Hypothetical relationship saved'));
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
                          <Empty title={tr('Your infrastructure starts here')}>
                            <span>
                              {tr(
                                'Scan a permitted IPv4 address to discover real hosts and services.',
                              )}
                            </span>
                            <button className="primary" onClick={startScan}>
                              <Play size={14} />
                              {tr('Run your first scan')}
                            </button>
                          </Empty>
                        </div>
                      )}
                    </div>
                    <div className="graph-legend">
                      <span>
                        <i className="line" />
                        {tr('Observed relationship')}
                      </span>
                      <span>
                        <i className="line dashed" />
                        {tr('Manual hypothesis')}
                      </span>
                      <span>{tr('Drag handles to connect objects')}</span>
                    </div>
                  </>
                )}
                {page === 'Hosts' && detail && (
                  <div className="page">
                    <div className="page-heading">
                      <div>
                        <h1>{tr('Hosts')}</h1>
                        <p>
                          {tr('Observed infrastructure in ')}
                          {detail.project.name}
                        </p>
                      </div>
                      <button className="primary" onClick={startScan}>
                        <Play size={14} />
                        {tr('Start scan')}
                      </button>
                    </div>
                    {hostCount === 0 ? (
                      <Empty icon={Server} title={tr('No hosts discovered')}>
                        {tr('Start a scan to build an evidence-backed inventory.')}
                      </Empty>
                    ) : (
                      <div className="inventory">
                        <div className="inventory-head">
                          <span>{tr('Address')}</span>
                          <span>{tr('State')}</span>
                          <span>{tr('Services')}</span>
                          <span>{tr('Source')}</span>
                        </div>
                        <VirtualList
                          items={detail.nodes.filter((n) => n.kind === 'host')}
                          rowHeight={56}
                          itemKey={(n) => n.id}
                          label={tr('Host inventory')}
                          renderItem={(n) => (
                            <button className="inventory-row" onClick={() => setSelected(n.id)}>
                              <span className="mono">{n.label}</span>
                              <span>
                                <span className="badge success">{tr(String(n.attrs.state))}</span>
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
                        <h1>{tr('Scan history')}</h1>
                        <p>{tr('Real executions, preserved evidence and exact arguments.')}</p>
                      </div>
                      <button className="primary" onClick={startScan}>
                        <Plus size={14} />
                        {tr('New scan')}
                      </button>
                    </div>
                    <ScanHistory
                      pid={pid!}
                      revision={detail.scans.map((s) => s.id + s.status).join(',')}
                      onSelect={(id) => {
                        setScanId(id);
                        setBottom(true);
                      }}
                    />
                  </div>
                )}
                {page === 'Tools' && (
                  <div className="page">
                    <div className="page-heading">
                      <div>
                        <h1>{tr('Tool integrations')}</h1>
                        <p>{tr('System binaries. No duplicated tool installations.')}</p>
                      </div>
                      <button
                        onClick={() =>
                          void perform(async () => {
                            setTools(await api<Tool[]>('/tools'));
                            notify(tr('Tools checked'));
                          })
                        }
                      >
                        <Wrench size={15} />
                        {tr('Check installation')}
                      </button>
                    </div>
                    <section className="panel">
                      {tools.map((t) => (
                        <div className="tool-row" key={t.name}>
                          <Terminal size={24} />
                          <span>
                            <strong>{t.name}</strong>
                            <small>{t.version || tr('Version unavailable')}</small>
                            <code>
                              {t.path || tr('Install this tool using your system package manager')}
                            </code>
                          </span>
                          <span className={'badge ' + (t.installed ? 'success' : 'warning')}>
                            {t.installed ? tr('Installed') : tr('Missing')}
                          </span>
                        </div>
                      ))}
                      <p className="muted">
                        {tr(
                          'Tools are detected from your system. ProjectDiscovery httpx may be installed as httpx-toolkit on Kali. No tools run automatically.',
                        )}
                      </p>
                    </section>
                  </div>
                )}
                {detail && page in knowledgeKinds && (
                  <Suspense fallback={<div className="loading">{tr('Loading workspace…')}</div>}>
                    <Knowledge
                      key={detail.project.id + page}
                      detail={detail}
                      kind={knowledgeKinds[page as keyof typeof knowledgeKinds]}
                      nodeId={knowledgeSeed?.nodeId}
                      focusId={knowledgeSeed?.recordId}
                      onSeedConsumed={() => setKnowledgeSeed(undefined)}
                      onNode={(id) => {
                        setPage('Network Graph');
                        setSelected(id);
                      }}
                      onScan={(id) => {
                        setScanId(id);
                        setBottom(true);
                      }}
                      onChanged={() => refresh(detail.project.id)}
                    />
                  </Suspense>
                )}
                {detail && page === 'Task board' && (
                  <Suspense fallback={<div className="loading">{tr('Loading tasks…')}</div>}>
                    <Tasks
                      key={detail.project.id}
                      detail={detail}
                      focusId={knowledgeSeed?.recordId}
                      onSeedConsumed={() => setKnowledgeSeed(undefined)}
                      onChanged={() => refresh(detail.project.id)}
                      onNode={(id) => {
                        setPage('Network Graph');
                        setSelected(id);
                      }}
                    />
                  </Suspense>
                )}
                {detail && page === 'Reports' && (
                  <Suspense fallback={<div className="loading">{tr('Loading reports…')}</div>}>
                    <Reports key={detail.project.id} project={detail.project} />
                  </Suspense>
                )}
                {detail && page === 'Project overview' && (
                  <Suspense fallback={<div className="loading">{tr('Loading overview…')}</div>}>
                    <ProjectOverview
                      key={detail.project.id}
                      project={detail.project}
                      onNavigate={setPage}
                      onTasks={() => setPage('Task board')}
                      onFindings={() => setPage('Findings')}
                      onImport={() => setPage('Import results')}
                      onScope={() => setPage('Targets & scope')}
                      onRecon={startScan}
                      onProjectChanged={async () => {
                        await refreshProjects();
                        if (pid) await refresh(pid);
                      }}
                    />
                  </Suspense>
                )}
                {detail && page === 'Credentials Vault' && (
                  <Suspense fallback={<div className="loading">{tr('Loading vault…')}</div>}>
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
                  <Suspense fallback={<div className="loading">{tr('Loading evidence…')}</div>}>
                    <Evidence
                      key={detail.project.id + (evidenceFocus || '')}
                      pid={detail.project.id}
                      focusId={evidenceFocus}
                    />
                  </Suspense>
                )}
                {detail && page === 'Methodologies' && (
                  <Methodologies key={detail.project.id} detail={detail} />
                )}
                {detail && page === 'Recon workflows' && (
                  <Workflows
                    key={detail.project.id}
                    detail={detail}
                    onChanged={() => refresh(detail.project.id)}
                    onScan={(s) => {
                      setScanId(s.id);
                      setPage('Scans');
                      setBottom(true);
                    }}
                  />
                )}
                {detail && page === 'Targets & scope' && (
                  <ScopePage
                    key={detail.project.id}
                    pid={detail.project.id}
                    onChanged={() => refresh(detail.project.id)}
                    onContinue={startScan}
                  />
                )}
                {detail && page === 'Import results' && (
                  <ImportsPage
                    onNavigate={setPage}
                    key={detail.project.id}
                    pid={detail.project.id}
                    onChanged={() => refresh(detail.project.id)}
                  />
                )}
                {detail && page === 'Web applications' && (
                  <WebMap
                    key={detail.project.id}
                    detail={detail}
                    onChanged={() => refresh(detail.project.id)}
                    onRecon={(origin) => {
                      setTarget(origin);
                      setProfileId('httpx');
                      setServiceNode(undefined);
                      setScanError('');
                      setModal('scan');
                    }}
                    onInspect={(id) => {
                      setSelected(id);
                      setNodeKind('all');
                      setPage('Network Graph');
                    }}
                    onFinding={(id) => {
                      setKnowledgeSeed({ recordId: id, nonce: Date.now() });
                      setPage('Findings');
                    }}
                    onKnowledge={(id, kind) => {
                      setKnowledgeSeed({ nodeId: id, nonce: Date.now() });
                      setPage(kind);
                    }}
                  />
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
                        <h1>{tr('Environment settings')}</h1>
                        <p>{tr('Predictable defaults for a small, local workstation.')}</p>
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
                        ['Output', '64 KiB terminal tail · 16 MiB result file cap'],
                        [
                          'Evidence retention',
                          'Bounded XML/JSON results, including partial outcomes, are retained',
                        ],
                        [
                          'Investigation workspace',
                          'Notes, Findings, manual Attack Paths and encrypted Credentials Vault',
                        ],
                      ].map(([k, v]) => (
                        <div key={k}>
                          <strong>{tr(k)}</strong>
                          <span>{tr(v)}</span>
                        </div>
                      ))}
                    </section>
                  </div>
                )}
                {error && !detail && (
                  <button className="retry" onClick={() => void initialize()}>
                    {tr('Retry connection')}
                  </button>
                )}
              </>
            )}
          </main>
          {(page === 'Network Graph' || page === 'Hosts') &&
            (object || selectedEdge) &&
            !inspectorHidden && (
              <aside className="inspector">
                <div className="inspector-title">
                  <span>{tr('INSPECTOR')}</span>
                  <button
                    className="icon-button"
                    aria-label={tr('Close inspector')}
                    onClick={() => setInspectorHidden(true)}
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
                      <span className="eyebrow">{tr(object.kind)}</span>
                      <h2>{object.label}</h2>
                      <span
                        className={'badge ' + (object.kind === 'custom' ? 'warning' : 'success')}
                      >
                        {object.kind === 'custom'
                          ? tr('Manual · ') + String(object.attrs.status || 'idea')
                          : (object.attrs.source === 'manual'
                              ? tr('Manual · ')
                              : object.attrs.run_id
                                ? tr('Imported · ')
                                : tr('Observed · ')) + String(object.attrs.source || 'nmap')}
                      </span>
                    </div>
                    {['service', 'application', 'endpoint', 'url'].includes(object.kind) && (
                      <div className="inspector-section">
                        <button disabled={busy} onClick={() => void openWebResearch(object)}>
                          {tr('Open web research')}
                        </button>
                        <small>
                          {tr('Continue locally with this object. No request is sent.')}
                        </small>
                      </div>
                    )}
                    {pid && (
                      <SourceActions
                        key={'records:' + object.id}
                        pid={pid}
                        source="node"
                        id={object.id}
                      />
                    )}
                    {object.kind === 'custom' && (
                      <CustomObjectDetails
                        pid={pid!}
                        key={'custom:' + object.id}
                        node={object}
                        onSave={async (content) => {
                          await api(
                            '/projects/' + pid + '/nodes/' + encodeURIComponent(object.id),
                            'PUT',
                            content,
                          );
                          notify(tr('Object saved'));
                          await refresh(pid!).catch(() =>
                            setError(
                              tr('Object saved. Refresh failed; reopen the project to reload it.'),
                            ),
                          );
                        }}
                      />
                    )}
                    {object.kind !== 'custom' && (
                      <details className="inspector-section">
                        <summary>{tr('Object details')}</summary>
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
                              <span>{tr(k)}</span>
                              <strong>{String(v) || '—'}</strong>
                            </div>
                          ))}
                      </details>
                    )}
                    {pid && (
                      <Observations
                        key={'observations:' + object.id}
                        pid={pid}
                        nodeId={object.id}
                        focusId={
                          observationFocus?.node_id === object.id
                            ? observationFocus.observation_id
                            : undefined
                        }
                        onClearFocus={() => setObservationFocus(undefined)}
                      />
                    )}
                    <details>
                      <summary>{tr('Graph position')}</summary>
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
                          notify(tr('Position updated'));
                        }}
                      />
                    </details>
                    <div className="inspector-section">
                      <h3>{tr('Related objects')}</h3>
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
                      <details className="inspector-section">
                        <summary>{tr('Source evidence · JSON')}</summary>
                        {object.attrs.evidence_truncated === true && (
                          <p className="muted">
                            {tr('Preview truncated. Export the full scan evidence below.')}
                          </p>
                        )}
                        <p className="muted">
                          {tr('Scan ')}
                          {String(object.attrs.scan_id)}
                        </p>
                        <pre className="evidence">{String(object.attrs.evidence_json)}</pre>
                        <button
                          onClick={() =>
                            void perform(async () => {
                              const path = await saveArtifact(String(object.attrs.scan_id), 'json');
                              notify(tr('Evidence saved: ') + path);
                            })
                          }
                        >
                          {tr('Export source JSON')}
                        </button>
                      </details>
                    )}
                    {Array.isArray(object.attrs.observations) && (
                      <div className="inspector-section">
                        <h3>{tr('Recent observations')}</h3>
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
                      <details className="inspector-section">
                        <summary>{tr('Source evidence')}</summary>
                        <p className="muted">
                          {tr('Scan ')}
                          {String(object.attrs.scan_id)}
                        </p>
                        <pre className="evidence">{String(object.attrs.evidence_xml)}</pre>
                        <button
                          onClick={() =>
                            void perform(async () => {
                              const path = await saveArtifact(String(object.attrs.scan_id));
                              notify(tr('Evidence saved: ') + path);
                            })
                          }
                        >
                          <ArrowDownToLine size={14} />
                          {tr('Export source XML')}
                        </button>
                      </details>
                    )}
                    {object.kind === 'custom' && (
                      <div className="inspector-section">
                        <button className="danger-button" onClick={() => void removeNode(object)}>
                          {tr('Delete custom node')}
                        </button>
                      </div>
                    )}
                  </>
                )}
                {selectedEdge && (
                  <div className="inspector-section">
                    <h2>{selectedEdge.kind}</h2>
                    <span className={'badge ' + (selectedEdge.evidence ? 'success' : 'warning')}>
                      {selectedEdge.evidence ? tr('Observed') : tr('Manual hypothesis')}
                    </span>
                    <p>
                      {tr('Source: ')}
                      {detail?.nodes.find((n) => n.id === selectedEdge.source)?.label}
                    </p>
                    <p>
                      {tr('Target: ')}
                      {detail?.nodes.find((n) => n.id === selectedEdge.target)?.label}
                    </p>
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
                          notify(tr('Relationship updated'));
                        }}
                      />
                    )}
                    {!selectedEdge.evidence && (
                      <button
                        className="danger-button"
                        onClick={() => {
                          if (window.confirm(tr('Delete manual relationship?')))
                            void perform(async () => {
                              await api(
                                '/projects/' +
                                  pid +
                                  '/edges/' +
                                  encodeURIComponent(selectedEdge.id),
                                'DELETE',
                              );
                              setSelected(null);
                              await refresh(pid!);
                            });
                        }}
                      >
                        {tr('Delete relationship')}
                      </button>
                    )}
                  </div>
                )}
              </aside>
            )}
        </div>
        {pid && detail && detail.scans.length > 0 && (
          <BackgroundWork
            key={pid}
            pid={pid}
            scans={detail.scans}
            scan={scan}
            expanded={bottom}
            onExpand={setBottom}
            onSelect={setScanId}
            onCancel={async (id) => {
              const result = await api<{ scan: Scan }>('/scans/' + id + '/cancel', 'POST');
              if (activeProject.current !== pid) return;
              setScan(result.scan);
              await refresh(pid);
            }}
            onRetry={(previous) => {
              setTarget(previous.target);
              setProfileId(previous.profile || 'quick');
              setServiceNode(previous.options?.service_node);
              setScanError('');
              setModal('scan');
            }}
            onResult={async (result) => {
              const fresh = await refresh(pid);
              if (activeProject.current !== pid) return;
              const resultNodes = new Map(fresh.nodes.map((node) => [node.id, node]));
              setBottom(false);
              if (result.tool !== 'nmap') {
                const endpoint = result.options?.result?.node_ids
                  ?.map((id) => resultNodes.get(id))
                  .find((node) => node?.kind === 'endpoint');
                if (endpoint) {
                  putWorkspace(pid, 'web_origin', String(endpoint.attrs.origin));
                  putWorkspace(pid, 'web_node', endpoint.id);
                }
                setPage('Web applications');
              } else {
                setPage('Network Graph');
                setNodeKind('all');
                const node =
                  result.options?.result?.node_ids?.find(
                    (id) => resultNodes.get(id)?.kind === 'service',
                  ) || result.options?.result?.node_ids?.[0];
                if (node) setSelected(node);
              }
            }}
            onExport={async (result) => {
              const path = await saveArtifact(
                result.id,
                result.tool && result.tool !== 'nmap' ? 'json' : 'xml',
              );
              notify(tr('Evidence saved: ') + path);
            }}
          />
        )}
        <footer className="statusbar">
          <span>
            <ShieldCheck size={12} />
            {tr('Private by design')}
          </span>
          <span>
            {current?.name || tr('No project selected')}
            <i />
            {tr('SQLite · local storage')}
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
            {tr('Inspect object')}
          </button>
          <button
            onClick={() => {
              setName('');
              setModal('node');
              setContext(null);
            }}
          >
            {tr('Add custom node')}
          </button>
          {detail?.nodes.find((n) => n.id === context.id)?.kind === 'custom' && (
            <button onClick={() => void removeNode(detail.nodes.find((n) => n.id === context.id)!)}>
              {tr('Delete custom node')}
            </button>
          )}
        </div>
      )}
      {closeWarning && (
        <Dialog title={tr('Unsaved work is only in memory')} onClose={() => setCloseWarning(false)}>
          <p>
            {tr(
              'The browser storage and local backend could not retain some text. Keep Dragontrip open to retry saving, or download a recovery copy before closing.',
            )}
          </p>
          <div className="dialog-actions">
            <button onClick={() => setCloseWarning(false)}>{tr('Keep working')}</button>
            <button
              onClick={() =>
                void downloadText(memoryDraftValues())
                  .then((path) => notify(path))
                  .catch((e) => setError(tr('Recovery download failed: ') + e.message))
              }
            >
              {tr('Download recovery copy')}
            </button>
            <button className="danger-button" onClick={() => void invoke('confirm_close')}>
              {tr('Close without saving')}
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'project' && (
        <Dialog title={tr('Create a project')} onClose={closeModal}>
          <form onSubmit={submitProject}>
            <p className="muted">{tr('A dedicated workspace for an authorized engagement.')}</p>
            <label>
              {tr('Project name')}
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="HTB Lab"
              />
            </label>
            <label>
              {tr('Investigation goal')}
              <textarea
                maxLength={2000}
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder={tr('What question should this investigation answer?')}
              />
            </label>
            <label>
              {tr('Description')}
              <textarea
                maxLength={4000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tr('Engagement context (scope is defined in Plan)')}
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={closeModal}>
                {tr('Cancel')}
              </button>
              <button className="primary" disabled={busy || !name.trim()}>
                {busy ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}
                {tr('Create project')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'scan' && (
        <Dialog title={tr('Start recon task')} onClose={closeModal}>
          <ScanForm
            pid={pid || undefined}
            serviceNode={serviceNode}
            servicePort={
              Number(detail?.nodes.find((n) => n.id === serviceNode)?.attrs.port) || undefined
            }
            initialTarget={target}
            submissionError={scanError}
            initialProfile={profileId}
            busy={busy}
            onSubmit={(request) => void submitScan(request)}
            onClose={closeModal}
          />
        </Dialog>
      )}
      {modal === 'node' && (
        <Dialog title={tr('Add a custom object')} onClose={closeModal}>
          <p className="muted">
            {tr(
              'Describe an asset, note, hypothesis, task or reference. Connect objects using their handles.',
            )}
          </p>
          <NodeEditor
            pid={pid!}
            onCancel={closeModal}
            onSave={async (content) => {
              const node = await api<ObjectNode>('/projects/' + pid + '/nodes', 'POST', {
                ...content,
                x: 200,
                y: 450,
              });
              closeModal();
              notify(tr('Custom object saved'));
              const updated = await refresh(pid!).catch(() => {
                setError(tr('Object saved. Refresh failed; reopen the project to reload it.'));
                return undefined;
              });
              if (updated && activeProject.current === pid) setSelected(node.id);
            }}
          />
        </Dialog>
      )}
      {modal === 'command' && (
        <Dialog title={tr('Go to…')} onClose={closeModal}>
          <div className="command-input">
            <Search size={18} />
            <input
              aria-label={tr('Search commands')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('Pages, projects, objects, knowledge…')}
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
                      notify(tr('Vault locked'));
                    })
                    .catch((e) => setError(e.message));
                  closeModal();
                },
                enabled: true,
              },
            ]
              .filter(
                (item) => item.enabled && tr(item.name).toLowerCase().includes(query.toLowerCase()),
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
                  {tr(item.name)}
                  <span>{tr('Action')}</span>
                </button>
              ))}
            {[...nav, ...knowledgeNav]
              .filter(([n]) => tr(n).toLowerCase().includes(query.toLowerCase()))
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
                  {tr(n)}
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
                  <span>{tr('Project')}</span>
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
                  <span>{tr('Object')}</span>
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
