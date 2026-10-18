import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';
import { resetWorkspaceMemory } from './workspace';
import { api, saveArtifact } from './api';
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  api: vi.fn(),
  downloadArtifact: vi.fn(),
  saveArtifact: vi.fn(),
}));
vi.mock('./Graph', () => ({
  default: ({ objects, onSelect, onMove }: any) => (
    <div>
      {objects.map((n: any) => (
        <button key={n.id} onClick={() => onSelect(n.id)}>
          {n.label}
        </button>
      ))}
      <button onClick={() => onMove('service', 410, 220)}>Move service</button>
    </div>
  ),
}));
const project = {
  id: 'lab',
  name: 'HTB Lab',
  description: 'Authorized lab',
  created: '2026-10-15T12:00:00Z',
  updated: '2026-10-15T12:00:00Z',
};
const detail = {
  project,
  nodes: [
    {
      id: 'service',
      kind: 'service',
      label: '8080/tcp · http',
      x: 0,
      y: 0,
      attrs: {
        port: 8080,
        protocol: 'tcp',
        product: 'Lab server',
        state: 'open',
        source: 'nmap',
        scan_id: 'scan-1',
        evidence_xml: '<port portid="8080"/>',
      },
    },
  ],
  edges: [],
  scans: [
    {
      id: 'scan-1',
      target: '127.0.0.1',
      status: 'completed',
      started: project.created,
      ended: project.created,
      error: '',
      command: ['nmap', '127.0.0.1'],
      exit_code: '0',
    },
  ],
  events: [],
};
beforeEach(() => {
  resetWorkspaceMemory();
  localStorage.clear();
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (path === '/projects' && method === 'POST') return { ...project, ...(body as any) };
    if (path === '/projects') return [project];
    if (path.endsWith('/records')) return [];
    if (path.endsWith('/workspace')) return {};
    if (path.endsWith('/overview'))
      return {
        objects: {},
        scans: {},
        records: {},
        tasks: {},
        overdue: 0,
        active_risks: {},
        attachments: 0,
        as_of: project.updated,
      };
    if (path.includes('/observations?')) return { items: [], total: 0 };
    if (path === '/tools') return [{ name: 'Nmap', installed: true, path: '/usr/bin/nmap' }];
    if (path === '/projects/lab?compact=true') return detail;
    if (path === '/scans/scan-1') return { ...detail.scans[0], output: 'Actual output' };
    return { saved: true };
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe('workspace', () => {
  it('opens a project, shows real service attributes and persists movement', async () => {
    render(<App />);
    await screen.findByText('Workspace overview');
    fireEvent.click(screen.getByRole('button', { name: /HTB Lab Authorized lab/ }));
    await screen.findByRole('button', { name: '8080/tcp · http' });
    fireEvent.click(screen.getByRole('button', { name: '8080/tcp · http' }));
    expect(await screen.findByText('INSPECTOR')).toBeVisible();
    fireEvent.click(screen.getByText('Object details'));
    expect(screen.getByText('Lab server')).toBeVisible();
    fireEvent.click(screen.getByText('Source evidence'));
    expect(screen.getByText('<port portid="8080"/>')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Move service' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/projects/lab/nodes/service/position', 'PUT', {
        x: 410,
        y: 220,
      }),
    );
    expect(localStorage.getItem('dragontrip.project')).toBe('lab');
    fireEvent.click(screen.getByRole('button', { name: /Background work/ }));
    fireEvent.click(screen.getByText('Technical output and exact command'));
    expect(await screen.findByText(/Actual output/)).toBeVisible();
  });
  it('exports source evidence through the native save action', async () => {
    vi.mocked(saveArtifact).mockResolvedValue('/tmp/Downloads/nmap-scan.xml');
    render(<App />);
    await screen.findByText('Workspace overview');
    fireEvent.click(screen.getByRole('button', { name: /HTB Lab Authorized lab/ }));
    fireEvent.click(await screen.findByRole('button', { name: '8080/tcp · http' }));
    fireEvent.click(screen.getByText('Source evidence'));
    fireEvent.click(screen.getByRole('button', { name: 'Export source XML' }));
    await waitFor(() => expect(saveArtifact).toHaveBeenCalledWith('scan-1'));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Evidence saved: /tmp/Downloads/nmap-scan.xml',
    );
  });
  it('creates a project through the API and navigates to it', async () => {
    render(<App />);
    await screen.findByText('Workspace overview');
    fireEvent.click(screen.getByRole('button', { name: 'New project' }));
    fireEvent.change(screen.getByLabelText('Project name'), { target: { value: 'My Lab' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith('/projects', 'POST', {
        name: 'My Lab',
        description: '',
        goal: '',
      }),
    );
    await screen.findByRole('heading', { name: 'Start with the evidence you already have' });
  });
  it('surfaces backend failure and lets the user retry', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Backend unavailable'));
    render(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Backend unavailable');
    expect(screen.getByRole('button', { name: 'Retry connection' })).toBeVisible();
  });
  it('opens command palette with Ctrl K and navigates', async () => {
    render(<App />);
    await screen.findByText('Workspace overview');
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Search commands'), { target: { value: 'Tools' } });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(dialog.querySelector('.commands button')!);
    expect(await screen.findByText('Tool integrations')).toBeVisible();
  });
});

it('keeps tab selection, group memory and collapsed menu through navigation', async () => {
  render(<App />);
  await screen.findByText('Workspace overview');
  fireEvent.click(screen.getByRole('button', { name: /HTB Lab Authorized lab/ }));
  await screen.findByRole('tab', { name: 'Network Graph' });
  fireEvent.click(screen.getByRole('tab', { name: 'Hosts' }));
  expect(screen.getByRole('tab', { name: 'Hosts' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Recon' }));
  fireEvent.click(screen.getByRole('button', { name: 'Research' }));
  expect(screen.getByRole('tab', { name: 'Hosts' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }));
  await waitFor(() => expect(localStorage.getItem('dragontrip.sidebarCollapsed')).toBe('true'));
  expect(screen.getByRole('button', { name: 'Expand sidebar' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
  expect(screen.getByRole('tab', { name: 'Scans' })).toHaveAttribute('aria-selected', 'true');
});

it('reopens the current project from Projects at its last research page', async () => {
  render(<App />);
  await screen.findByText('Workspace overview');
  fireEvent.click(screen.getByRole('button', { name: /HTB Lab Authorized lab/ }));
  await screen.findByRole('tab', { name: 'Hosts' });
  fireEvent.click(screen.getByRole('tab', { name: 'Hosts' }));
  fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
  fireEvent.click(await screen.findByRole('button', { name: /HTB Lab Authorized lab/ }));
  await waitFor(() =>
    expect(screen.getByRole('tab', { name: 'Hosts' })).toHaveAttribute('aria-selected', 'true'),
  );
});

it('does not duplicate the selected custom object editor on repeated refreshes', async () => {
  const custom = {
    ...detail.nodes[0],
    kind: 'custom',
    label: 'Manual lead',
    attrs: { category: 'hypothesis', description: 'Context', status: 'idea' },
  };
  const previous = vi.mocked(api).getMockImplementation()!;
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (path === '/projects/lab?compact=true') return { ...detail, nodes: [custom] };
    if (path === '/projects/lab/nodes/service') return custom;
    return previous(path, method, body);
  });
  render(<App />);
  await screen.findByText('Workspace overview');
  fireEvent.click(screen.getByRole('button', { name: /HTB Lab Authorized lab/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Manual lead' }));
  for (let index = 0; index < 3; index++) {
    fireEvent.click(screen.getByRole('button', { name: 'Move service' }));
    await waitFor(() =>
      expect(screen.getAllByRole('button', { name: 'Edit object' })).toHaveLength(1),
    );
  }
  fireEvent.click(screen.getByRole('button', { name: 'Close inspector' }));
  expect(screen.queryByText('INSPECTOR')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Show inspector' }));
  expect(screen.getAllByRole('button', { name: 'Edit object' })).toHaveLength(1);
});

it.each(['response', 'error'])(
  'ignores a late project %s after switching projects',
  async (outcome) => {
    const other = { ...project, id: 'other', name: 'Other project' };
    let resolve!: (value: unknown) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise((yes, no) => {
      resolve = yes;
      reject = no;
    });
    const previous = vi.mocked(api).getMockImplementation()!;
    vi.mocked(api).mockImplementation(async (path, method, body) => {
      if (path === '/projects') return [project, other];
      if (path === '/projects/lab?compact=true') return pending;
      if (path === '/projects/other?compact=true')
        return {
          ...detail,
          project: other,
          nodes: [{ ...detail.nodes[0], id: 'other-node', label: 'Other service' }],
          scans: [],
        };
      return previous(path, method, body);
    });
    render(<App />);
    await screen.findByText('Workspace overview');
    fireEvent.click(screen.getByRole('button', { name: /HTB Lab Authorized lab/ }));
    await waitFor(() => expect(api).toHaveBeenCalledWith('/projects/lab?compact=true'));
    fireEvent.click(screen.getByRole('button', { name: 'Projects' }));
    fireEvent.click(await screen.findByRole('button', { name: /Other project Authorized lab/ }));
    await screen.findByRole('button', { name: 'Other service' });
    await act(async () => {
      if (outcome === 'response') resolve(detail);
      else reject(new Error('Late error from previous project'));
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Other service' })).toBeVisible();
    expect(screen.queryByRole('button', { name: '8080/tcp · http' })).toBeNull();
    expect(screen.queryByText('Late error from previous project')).toBeNull();
    expect(localStorage.getItem('dragontrip.project')).toBe('other');
  },
);
