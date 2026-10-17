import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api, ApiError, uploadFile, type Detail } from './api';
import { Editor, type KnowledgeRecord } from './Knowledge';
import { AttachmentLinks } from './Evidence';
import {
  getWorkspace,
  loadWorkspace,
  memoryOnlyDrafts,
  putWorkspace,
  resetWorkspaceMemory,
  workspaceStatus,
} from './workspace';
import { useNavigation } from './navigation';
vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  api: vi.fn(),
  uploadFile: vi.fn(),
}));
const detail: Detail = {
  project: { id: 'p', name: 'Lab', description: '', created: '', updated: '' },
  nodes: [],
  edges: [],
  scans: [],
  events: [],
};
const row: KnowledgeRecord = {
  id: 'note',
  kind: 'note',
  title: 'Hypothesis',
  created: '2026-01-01T12:00:00Z',
  updated: '2026-01-01T12:00:00Z',
  content: {
    body: 'original',
    node_ids: [],
    scan_ids: [],
    attachment_ids: [],
    severity: 'info',
    status: 'draft',
    remediation: '',
    steps: [],
  },
};
beforeEach(() => {
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (path.endsWith('/workspace')) return {};
    if (path.includes('/workspace/')) return body;
    if (path.endsWith('/knowledge/note')) return row;
    if (method === 'POST' || method === 'PUT') return row;
    return [];
  });
});
afterEach(() => {
  cleanup();
  resetWorkspaceMemory();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('shows both conflict versions, retains my text and saves a manual merge against the latest version', async () => {
  const latest = {
    ...row,
    updated: '2026-01-02T12:00:00Z',
    content: { ...row.content, body: 'saved by another editor' },
  };
  const saved = vi.fn();
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (path.endsWith('/workspace')) return {};
    if (method === 'PUT' && path.endsWith('/knowledge/note')) {
      if ((body as { expected_updated: string }).expected_updated !== latest.updated)
        throw new ApiError(409, { current: latest });
      return latest;
    }
    if (path.endsWith('/knowledge/note')) return row;
    return [];
  });
  render(
    <Editor
      detail={detail}
      kind="note"
      record={row}
      draftId="conflict"
      onSave={saved}
      onCancel={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Content'), { target: { value: 'my reasoning' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
  expect(await screen.findByText('This record changed')).toBeVisible();
  expect(screen.getByText('saved by another editor')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Merge manually in editor' }));
  expect(screen.getByLabelText('Content')).toHaveValue('my reasoning');
  fireEvent.change(screen.getByLabelText('Content'), {
    target: { value: 'my reasoning + saved observation' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(latest));
  expect(getWorkspace('p', 'draft:conflict', null)).toBeNull();
  const retained = JSON.parse(localStorage.getItem('dragontrip.workspace:p:draft:conflict')!);
  expect(retained.value.data.recovery.content.body).toBe('my reasoning');
});

it('can save a conflicting draft as an idempotent separate record', async () => {
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (path.endsWith('/workspace')) return {};
    if (path.endsWith('/knowledge/note') && method !== 'PUT') return { ...row, updated: 'newer' };
    if (method === 'POST') return { ...row, id: 'copy' };
    return body || [];
  });
  const saved = vi.fn();
  render(
    <Editor
      detail={detail}
      kind="note"
      record={row}
      draftId="copy-id"
      onSave={saved}
      onCancel={vi.fn()}
    />,
  );
  await screen.findByText('This record changed');
  fireEvent.click(screen.getByRole('button', { name: 'Save my version as a separate record' }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 'copy' })));
  expect(api).toHaveBeenCalledWith(
    '/projects/p/knowledge',
    'POST',
    expect.objectContaining({ request_id: 'copy-id', expected_updated: undefined }),
  );
});

it('retains memory-only text across editors and warns before leaving the application', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded');
  });
  vi.mocked(api).mockRejectedValue(new Error('Backend unavailable'));
  const props = { detail, kind: 'note' as const, onSave: vi.fn(), onCancel: vi.fn() };
  const first = render(<Editor {...props} draftId="a" />);
  fireEvent.change(screen.getByLabelText('Content'), {
    target: { value: 'only copy of reasoning' },
  });
  first.unmount();
  render(<Editor {...props} draftId="b" />).unmount();
  render(<Editor {...props} draftId="a" />);
  expect(screen.getByLabelText('Content')).toHaveValue('only copy of reasoning');
  fireEvent.click(screen.getByRole('button', { name: 'Retry sync' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('only in memory'));
  expect(memoryOnlyDrafts()).toBeGreaterThan(0);
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});

it('restores a backend-only draft and keeps projects isolated', async () => {
  const cell = {
    revision: 100,
    closed: false,
    value: { data: { title: 'retained after restart' } },
  };
  vi.mocked(api).mockResolvedValue({ 'draft:restart': cell });
  await loadWorkspace('p');
  expect(getWorkspace('p', 'draft:restart', null)).toEqual(cell.value.data);
  expect(getWorkspace('other', 'draft:restart', null)).toBeNull();
  expect(workspaceStatus('p', 'draft:restart')).toContain('saved on this device');
});

it('closed drafts ignore delayed autosave and cannot reappear as active text', async () => {
  putWorkspace('p', 'draft:late', { body: 'my text' });
  putWorkspace('p', 'draft:late', { body: 'my text' }, true);
  putWorkspace('p', 'draft:late', { body: 'stale callback' });
  expect(getWorkspace('p', 'draft:late', null)).toBeNull();
  const retained = JSON.parse(localStorage.getItem('dragontrip.workspace:p:draft:late')!);
  expect(retained.value.data.body).toBe('my text');
});

it('does not link a completed upload after its editor has closed', async () => {
  let complete!: (value: unknown) => void;
  vi.mocked(uploadFile).mockImplementation(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const changed = vi.fn();
  const mounted = render(<AttachmentLinks pid="p" ids={[]} onChange={changed} />);
  fireEvent.change(screen.getByLabelText('Upload evidence'), {
    target: { files: [new File(['evidence'], 'proof.txt')] },
  });
  mounted.unmount();
  complete({ id: 'file', filename: 'proof.txt' });
  await Promise.resolve();
  expect(changed).not.toHaveBeenCalled();
});

it('retains Back/Forward separately for each project', () => {
  function Nav({ pid }: { pid: string }) {
    const nav = useNavigation<'Graph' | 'Notes'>('Graph', pid);
    return (
      <>
        <span>{nav.page}</span>
        <button onClick={() => nav.navigate('Notes')}>Notes</button>
        <button onClick={nav.back}>Back</button>
        <button onClick={nav.forward}>Forward</button>
      </>
    );
  }
  const mounted = render(<Nav pid="one" />);
  fireEvent.click(screen.getByRole('button', { name: 'Notes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(screen.getByText('Graph')).toBeVisible();
  mounted.rerender(<Nav pid="two" />);
  expect(screen.getByText('Graph')).toBeVisible();
  mounted.rerender(<Nav pid="one" />);
  fireEvent.click(screen.getByRole('button', { name: 'Forward' }));
  expect(screen.getAllByText('Notes')[0]).toBeVisible();
});

it('does not replace new text with a delayed workspace hydration response', async () => {
  let finish!: (value: unknown) => void;
  vi.mocked(api).mockImplementation((path, _method, body) =>
    path.endsWith('/workspace')
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(body || []),
  );
  const loading = loadWorkspace('p');
  putWorkspace('p', 'draft:hydration', { body: 'typed while loading' });
  finish({
    'draft:hydration': {
      revision: Date.now() + 100000,
      closed: false,
      value: { data: { body: 'old backend text' } },
    },
  });
  await loading;
  expect(getWorkspace('p', 'draft:hydration', null)).toEqual({ body: 'typed while loading' });
});

it('retains methodology check notes across page unmounts and resolves stale saves explicitly', async () => {
  const { Methodologies } = await import('./Methodologies');
  const selected = {
    id: 'checks',
    title: 'Service review',
    kind: 'checklist',
    updated: '2026-01-01T12:00:00Z',
    content: {
      checks: [
        { key: 'identity', title: 'Identify service', state: 'in_progress', note: 'original note' },
      ],
      node_ids: [],
      scan_ids: [],
      attachment_ids: [],
      actions: [],
      body: '',
      status: 'open',
    },
  };
  const latest = { ...selected, updated: '2026-01-02T12:00:00Z' };
  putWorkspace('p', 'methodology_work', selected);
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (path.endsWith('/workspace')) return {};
    if (path.includes('/workspace/')) return body;
    if (path.endsWith('/knowledge/checks') && method === 'PUT')
      throw new ApiError(409, { current: latest });
    return [];
  });
  const first = render(<Methodologies detail={detail} />);
  fireEvent.change(screen.getByLabelText('Check notes: Identify service'), {
    target: { value: 'negative result: no anonymous access' },
  });
  first.unmount();
  render(<Methodologies detail={detail} />);
  expect(screen.getByLabelText('Check notes: Identify service')).toHaveValue(
    'negative result: no anonymous access',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save methodology' }));
  await screen.findByText('This methodology changed');
  fireEvent.click(screen.getByRole('button', { name: 'Merge manually in checks below' }));
  expect(screen.getByLabelText('Check notes: Identify service')).toHaveValue(
    'negative result: no anonymous access',
  );
  expect(getWorkspace<{ updated: string }>('p', 'methodology_work', { updated: '' }).updated).toBe(
    latest.updated,
  );
});

it('opens a deleted task draft and can recover it as a separate task', async () => {
  const { default: Tasks } = await import('./Tasks');
  putWorkspace('p', 'tasks', {
    editing: true,
    record_id: 'deleted',
    draft_id: 'deleted-task',
    query: '',
    status: 'all',
  });
  putWorkspace('p', 'draft:deleted-task', {
    title: 'Retained check',
    record_id: 'deleted',
    request_id: 'deleted-task',
    expected_updated: 'old',
    changed: '2026-01-01T12:00:00Z',
    content: { ...row.content, status: 'todo', body: 'check result retained' },
  });
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (path.endsWith('/workspace')) return {};
    if (path.includes('/workspace/')) return body;
    if (path.endsWith('/knowledge/deleted')) throw new ApiError(404, 'Record not found');
    if (method === 'POST')
      return {
        ...row,
        kind: 'task',
        id: 'recovered',
        title: 'Retained check',
        content: { ...row.content, status: 'todo' },
      };
    return [];
  });
  render(<Tasks detail={detail} onChanged={async () => {}} onNode={vi.fn()} />);
  expect(screen.getByLabelText('Content')).toHaveValue('check result retained');
  await screen.findByText('The saved record was deleted');
  fireEvent.click(screen.getByRole('button', { name: 'Save my version as a separate record' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith(
      '/projects/p/knowledge',
      'POST',
      expect.objectContaining({ kind: 'task', request_id: 'deleted-task' }),
    ),
  );
  await waitFor(() => expect(screen.queryByLabelText('Content')).toBeNull());
});

it('does not open a source-created record in another workspace after unmounting', async () => {
  const { SourceActions } = await import('./SourceActions');
  let complete!: (value: unknown) => void;
  vi.mocked(api).mockImplementation((_path, method) =>
    method === 'POST'
      ? new Promise((resolve) => {
          complete = resolve;
        })
      : Promise.resolve([]),
  );
  const opened = vi.fn();
  window.addEventListener('dragontrip:record', opened);
  const mounted = render(<SourceActions pid="p" source="node" id="old-target" />);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Create linked record' })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create linked record' }));
  mounted.unmount();
  complete(row);
  await Promise.resolve();
  expect(opened).not.toHaveBeenCalled();
  window.removeEventListener('dragontrip:record', opened);
});

it('imports a 0.8 browser-only draft and never revives it after closure', async () => {
  localStorage.setItem(
    'dragontrip.draft:upgrade:note:new',
    JSON.stringify({
      revision: '1780000000000-' + 'a'.repeat(32),
      value: { title: 'Older draft', content: { body: 'browser-only legacy text' } },
    }),
  );
  await loadWorkspace('upgrade');
  expect(getWorkspace<any>('upgrade', 'draft:legacy-note-new', null).content.body).toBe(
    'browser-only legacy text',
  );
  expect(getWorkspace<any>('upgrade', 'knowledge:note', null).editing).toBe(true);
  putWorkspace('upgrade', 'draft:legacy-note-new', { title: 'Retained' }, true);
  resetWorkspaceMemory();
  await loadWorkspace('upgrade');
  expect(getWorkspace('upgrade', 'draft:legacy-note-new', null)).toBeNull();
});

it('does not block closing on an object that has already been saved', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Full');
  });
  putWorkspace('object-project', 'draft:object:new', { label: 'Persisted object', saved: true });
  expect(memoryOnlyDrafts()).toBe(0);
  putWorkspace('object-project', 'draft:object:new', { label: 'Unsaved changes', saved: false });
  expect(memoryOnlyDrafts()).toBe(1);
});
