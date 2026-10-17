import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api } from './api';
import { useDraft } from './useDraft';

vi.mock('./api', () => ({ api: vi.fn() }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
  vi.resetAllMocks();
});
function Harness({ pid }: { pid: string }) {
  const draft = useDraft(pid, 'note:new', { title: '' });
  return (
    <>
      <input
        aria-label="Draft title"
        disabled={!draft.ready}
        value={draft.value.title}
        onChange={(e) => draft.change({ title: e.target.value })}
      />
      <button onClick={() => void draft.clear()}>Clear</button>
      <p>{draft.error}</p>
    </>
  );
}
function server() {
  const rows = new Map<string, any>();
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (method === 'PUT') {
      rows.set(path, body);
      return body;
    }
    return rows.get(path) || { revision: '', value: null };
  });
  return rows;
}
async function ready() {
  await waitFor(() => expect(screen.getByLabelText('Draft title')).toBeEnabled());
}
it('recovers a draft across unmount and keeps projects isolated', async () => {
  const rows = server();
  const pid = crypto.randomUUID();
  const first = render(<Harness pid={pid} />);
  await ready();
  fireEvent.change(screen.getByLabelText('Draft title'), {
    target: { value: 'Keep this reasoning' },
  });
  expect(localStorage.getItem(`dragontrip.draft:${pid}:note:new`)).toContain('Keep this reasoning');
  first.unmount();
  const second = render(<Harness pid={pid} />);
  await ready();
  expect(screen.getByLabelText('Draft title')).toHaveValue('Keep this reasoning');
  expect(rows.get(`/projects/${pid}/drafts/note:new`).value.title).toBe('Keep this reasoning');
  second.unmount();
  render(<Harness pid={crypto.randomUUID()} />);
  await ready();
  expect(screen.getByLabelText('Draft title')).toHaveValue('');
});
it('recovers from SQLite when there is no WebView copy', async () => {
  const rows = server();
  const pid = crypto.randomUUID();
  rows.set(`/projects/${pid}/drafts/note:new`, {
    revision: '0000000000001-' + 'a'.repeat(32),
    value: { title: 'Database recovery' },
  });
  render(<Harness pid={pid} />);
  await ready();
  expect(screen.getByLabelText('Draft title')).toHaveValue('Database recovery');
});
it('a cleared draft stays cleared across remount', async () => {
  server();
  const pid = crypto.randomUUID();
  const first = render(<Harness pid={pid} />);
  await ready();
  fireEvent.change(screen.getByLabelText('Draft title'), { target: { value: 'Old copy' } });
  fireEvent.click(screen.getByText('Clear'));
  first.unmount();
  render(<Harness pid={pid} />);
  await ready();
  expect(screen.getByLabelText('Draft title')).toHaveValue('');
});
it('orders a pending write before recovery on the next mount', async () => {
  const rows = new Map<string, any>();
  let release: (() => void) | undefined;
  vi.mocked(api).mockImplementation(async (path, method, body) => {
    if (method === 'PUT') {
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      rows.set(path, body);
      return body;
    }
    return rows.get(path) || { revision: '', value: null };
  });
  const pid = crypto.randomUUID();
  const first = render(<Harness pid={pid} />);
  await ready();
  fireEvent.change(screen.getByLabelText('Draft title'), { target: { value: 'Ordered recovery' } });
  first.unmount();
  render(<Harness pid={pid} />);
  await waitFor(() => expect(release).toBeDefined());
  expect(screen.getByLabelText('Draft title')).toBeDisabled();
  release!();
  await ready();
  expect(screen.getByLabelText('Draft title')).toHaveValue('Ordered recovery');
});
it('keeps edits in memory and guards closing when both stores fail', async () => {
  vi.mocked(api).mockImplementation(async (_path, method) => {
    if (method === 'PUT') throw new Error('Disk unavailable');
    return { revision: '', value: null };
  });
  render(<Harness pid={crypto.randomUUID()} />);
  await ready();
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Quota exceeded');
  });
  fireEvent.change(screen.getByLabelText('Draft title'), { target: { value: 'Unsaved recovery' } });
  await screen.findByText(/Disk unavailable/);
  expect(screen.getByLabelText('Draft title')).toHaveValue('Unsaved recovery');
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
});
