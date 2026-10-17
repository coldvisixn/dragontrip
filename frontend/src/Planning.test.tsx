import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import Tasks from './Tasks';
import Reports from './Reporting';
import { api, type Detail } from './api';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  api: vi.fn(),
}));
const project = { id: 'lab', name: 'Lab', description: '', created: '', updated: '' };
const detail: Detail = {
  project,
  nodes: [{ id: 'host', label: 'Lab host', kind: 'custom', attrs: {}, x: 0, y: 0 }],
  edges: [],
  scans: [],
  events: [],
};
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('planning workflow', () => {
  it('creates a linked task with an owner and deadline, then closes the editor', async () => {
    vi.mocked(api).mockImplementation(async (_path, method) =>
      method === 'POST' ? { id: 'task' } : [],
    );
    render(<Tasks detail={detail} onChanged={async () => {}} onNode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Review service' } });
    fireEvent.click(screen.getByText('Owner and due date'));
    fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Reviewer' } });
    fireEvent.change(screen.getByLabelText('Due date'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByText('Objects, sources and evidence'));
    fireEvent.click(screen.getByRole('checkbox', { name: /Lab host/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    await waitFor(() =>
      expect(api).toHaveBeenCalledWith(
        '/projects/lab/knowledge',
        'POST',
        expect.objectContaining({
          kind: 'task',
          title: 'Review service',
          content: expect.objectContaining({
            status: 'todo',
            assignee: 'Reviewer',
            due_date: '2026-11-01',
            node_ids: ['host'],
          }),
        }),
      ),
    );
    await waitFor(() => expect(screen.queryByLabelText('Title')).not.toBeInTheDocument());
  });

  it('keeps task content available after a failed save', async () => {
    vi.mocked(api).mockImplementation(async (_path, method) => {
      if (method === 'POST') throw new Error('Storage is unavailable');
      return [];
    });
    render(<Tasks detail={detail} onChanged={async () => {}} onNode={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Keep this task' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save task' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage is unavailable');
    expect(screen.getByLabelText('Title')).toHaveValue('Keep this task');
  });

  it('requires a fresh preview when report filters change and exports the selected options', async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.endsWith('/export')
        ? { path: '/tmp/report.md', sha256: 'abc' }
        : { markdown: '# Report\n\nReview content', finding_count: 1 },
    );
    render(<Reports project={project} />);
    const exportButton = screen.getByRole('button', { name: 'Export Markdown' });
    expect(exportButton).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
    expect(
      await within(screen.getByLabelText('Report preview')).findByText('Review content'),
    ).toBeVisible();
    expect(exportButton).toBeEnabled();
    fireEvent.change(screen.getByLabelText('Minimum severity'), { target: { value: 'high' } });
    expect(exportButton).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Generate preview' }));
    await waitFor(() => expect(exportButton).toBeEnabled());
    fireEvent.click(exportButton);
    expect(await screen.findByRole('status')).toHaveTextContent('/tmp/report.md');
    expect(api).toHaveBeenCalledWith(
      '/projects/lab/report/export',
      'POST',
      expect.objectContaining({ minimum_severity: 'high', include_notes: false }),
    );
  });
});
