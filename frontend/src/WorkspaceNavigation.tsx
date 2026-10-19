import { t as tr, useLocale } from './i18n';
import {
  Activity,
  Target,
  LayoutDashboard,
  Folder,
  Network,
  ShieldAlert,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export const sectionGroups = [
  {
    id: 'plan',
    label: 'Plan',
    icon: Target,
    pages: ['Project overview', 'Targets & scope', 'Methodologies'],
  },
  {
    id: 'assets',
    label: 'Research',
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
    label: 'Notebook',
    icon: ShieldAlert,
    pages: [
      'Notes',
      'Findings',
      'Task board',
      'Attack Paths',
      'Evidence',
      'Credentials Vault',
      'Timeline',
      'Project search',
      'Reports',
    ],
  },
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
  useLocale();
  return (
    <button
      className={selected ? 'active' : ''}
      onClick={onClick}
      disabled={disabled}
      aria-current={selected ? 'page' : undefined}
      aria-label={tr(label)}
      title={disabled ? tr('Open a project to use ') + tr(label) : tr(label)}
      data-pages={pages?.join('|')}
    >
      <Icon size={18} />
      <span className="navigation-label">{tr(label)}</span>
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
  useLocale();
  const section = sectionFor(page);
  return (
    <>
      <div className="nav-label">{tr('WORKSPACE')}</div>
      <nav aria-label={tr('Workspace navigation')}>
        <NavigationButton
          label={tr('Dashboard')}
          Icon={LayoutDashboard}
          selected={page === 'Dashboard'}
          onClick={() => onNavigate('Dashboard')}
        />
        <NavigationButton
          label={tr('Projects')}
          Icon={Folder}
          selected={page === 'Projects'}
          onClick={() => onNavigate('Projects')}
        />
      </nav>
      <div className="nav-label project-nav-label">{tr('PROJECT')}</div>
      <nav aria-label={tr('Project navigation')}>
        {sectionGroups
          .filter((g) => g.id !== 'settings')
          .map((g) => (
            <NavigationButton
              key={g.id}
              label={tr(g.label)}
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
  useLocale();
  const group = sectionGroups.find((g) => g.id === 'settings')!;
  return (
    <nav aria-label={tr('Environment navigation')}>
      <NavigationButton
        label={tr('Settings')}
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
  useLocale();
  const section = sectionFor(page);
  if (!section) return null;
  return (
    <div className="section-tabs-wrap">
      <span className="section-tabs-label">{tr(section.label)}</span>
      <div
        className="section-tabs"
        role="tablist"
        aria-label={tr(section.label) + tr(' sections')}
        aria-orientation="vertical"
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
          const index = tabs.indexOf(document.activeElement as HTMLButtonElement);
          const key = event.key;
          if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key))
            return;
          event.preventDefault();
          const next =
            key === 'Home'
              ? 0
              : key === 'End'
                ? tabs.length - 1
                : (index + (['ArrowRight', 'ArrowDown'].includes(key) ? 1 : -1) + tabs.length) %
                  tabs.length;
          tabs[next]?.focus();
          tabs[next]?.click();
        }}
      >
        {section.pages.map((name) => (
          <button
            key={name}
            id={tabId(name)}
            type="button"
            title={tr(name)}
            aria-label={tr(name)}
            data-short={name
              .split(/ |&/)
              .filter(Boolean)
              .map((word) => word[0])
              .join('')
              .slice(0, 3)}
            role="tab"
            aria-selected={page === name}
            aria-controls="workspace-section-panel"
            tabIndex={page === name ? 0 : -1}
            onClick={() => onNavigate(name)}
          >
            <span>{tr(name)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
