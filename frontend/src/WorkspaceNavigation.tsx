import {
  Activity,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Folder,
  Network,
  ShieldAlert,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export const sectionGroups = [
  {
    id: 'project',
    label: 'Project',
    icon: ClipboardList,
    pages: ['Project overview', 'Targets & scope', 'Task board', 'Timeline', 'Project search'],
  },
  {
    id: 'assets',
    label: 'Assets',
    icon: Network,
    pages: ['Network Graph', 'Hosts', 'Web applications'],
  },
  {
    id: 'recon',
    label: 'Recon',
    icon: Activity,
    pages: ['Scans', 'Import results', 'Recon workflows'],
  },
  {
    id: 'investigation',
    label: 'Investigation',
    icon: ShieldAlert,
    pages: ['Findings', 'Notes', 'Evidence', 'Attack Paths', 'Methodologies', 'Credentials Vault'],
  },
  { id: 'reports', label: 'Reports', icon: FileText, pages: ['Reports'] },
  { id: 'settings', label: 'Settings', icon: Settings, pages: ['Settings', 'Tools'] },
] as const;
export type SectionPage = (typeof sectionGroups)[number]['pages'][number];
export type WorkspacePage = SectionPage | 'Dashboard' | 'Projects';
export const sectionFor = (page: WorkspacePage) =>
  sectionGroups.find((g) => (g.pages as readonly string[]).includes(page));
export const tabId = (page: string) =>
  'workspace-tab-' + page.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-');

function NavigationButton({
  label,
  Icon,
  selected,
  onClick,
  disabled,
  pages,
  count = 0,
}: {
  label: string;
  Icon: LucideIcon;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
  pages?: readonly string[];
  count?: number;
}) {
  return (
    <button
      className={selected ? 'active' : ''}
      onClick={onClick}
      disabled={disabled}
      aria-current={selected ? 'page' : undefined}
      aria-label={label}
      title={disabled ? 'Open a project to use ' + label : label}
      data-pages={pages?.join('|')}
    >
      <Icon size={18} />
      <span className="navigation-label">{label}</span>
      {count > 0 && <span className="count">{count}</span>}
    </button>
  );
}

export function PrimaryNavigation({
  page,
  hasProject,
  running,
  onNavigate,
  remembered,
}: {
  page: WorkspacePage;
  hasProject: boolean;
  running: number;
  onNavigate: (page: WorkspacePage) => void;
  remembered: Partial<Record<string, WorkspacePage>>;
}) {
  const section = sectionFor(page);
  return (
    <>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Workspace navigation">
        <NavigationButton
          label="Dashboard"
          Icon={LayoutDashboard}
          selected={page === 'Dashboard'}
          onClick={() => onNavigate('Dashboard')}
        />
        <NavigationButton
          label="Projects"
          Icon={Folder}
          selected={page === 'Projects'}
          onClick={() => onNavigate('Projects')}
        />
      </nav>
      <div className="nav-label project-nav-label">PROJECT</div>
      <nav aria-label="Project navigation">
        {sectionGroups
          .filter((g) => g.id !== 'settings')
          .map((g) => (
            <NavigationButton
              key={g.id}
              label={g.label}
              Icon={g.icon}
              selected={section?.id === g.id}
              disabled={!hasProject}
              pages={g.pages}
              count={g.id === 'recon' ? running : 0}
              onClick={() => onNavigate(remembered[g.id] || g.pages[0])}
            />
          ))}
      </nav>
    </>
  );
}
export function SettingsNavigation({
  page,
  onNavigate,
  remembered,
}: {
  page: WorkspacePage;
  onNavigate: (page: WorkspacePage) => void;
  remembered: Partial<Record<string, WorkspacePage>>;
}) {
  const group = sectionGroups.find((g) => g.id === 'settings')!;
  return (
    <nav aria-label="Environment navigation">
      <NavigationButton
        label="Settings"
        Icon={Settings}
        selected={sectionFor(page)?.id === 'settings'}
        pages={group.pages}
        onClick={() => onNavigate(remembered.settings || 'Settings')}
      />
    </nav>
  );
}
export function SectionTabs({
  page,
  onNavigate,
}: {
  page: WorkspacePage;
  onNavigate: (page: WorkspacePage) => void;
}) {
  const section = sectionFor(page);
  if (!section || section.pages.length === 1) return null;
  return (
    <div className="section-tabs-wrap">
      <span className="section-tabs-label">{section.label}</span>
      <div
        className="section-tabs"
        role="tablist"
        aria-label={section.label + ' sections'}
        onKeyDown={(event) => {
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
          const key = event.key;
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
          event.preventDefault();
          const next =
            key === 'Home'
              ? 0
              : key === 'End'
                ? tabs.length - 1
                : (index + (key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabs[next]?.focus();
          tabs[next]?.click();
        }}
      >
        {section.pages.map((name) => (
          <button
            key={name}
            id={tabId(name)}
            type="button"
            role="tab"
            aria-selected={page === name}
            aria-controls="workspace-section-panel"
            tabIndex={page === name ? 0 : -1}
            onClick={() => onNavigate(name)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}
