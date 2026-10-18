import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScanForm, ReconSettings, ScanHistory } from './Recon';
import { api } from './api';
vi.mock('./api', () => ({ api: vi.fn() }));
const profiles = [
  { id: 'quick', name: 'Quick Scan', tool: 'nmap', ports: '', rate: 100, timeout: 240 },
  { id: 'full', name: 'Full Scan', tool: 'nmap', ports: '1-65535', rate: 100, timeout: 900 },
  { id: 'ffuf', name: 'Path discovery', tool: 'ffuf', ports: '', rate: 5, timeout: 180 },
];
beforeEach(() => {
  vi.mocked(api).mockImplementation(async (path) =>
    path === '/profiles' ? profiles : { concurrency: 1, tasks: [] },
  );
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('requires a separate explicit approval for a full scan', async () => {
  const submit = vi.fn();
  render(
    <ScanForm
      initialTarget="127.0.0.1"
      initialProfile="full"
      busy={false}
      onSubmit={submit}
      onClose={() => {}}
    />,
  );
  await screen.findByText(/nmap · 1-65535/);
  const checks = screen.getAllByRole('checkbox');
  fireEvent.click(checks[0]);
  expect(screen.getByRole('button', { name: 'Start scan' })).toBeDisabled();
  fireEvent.click(checks[1]);
  fireEvent.click(screen.getByRole('button', { name: 'Start scan' }));
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({
      target: '127.0.0.1',
      profile: 'full',
      authorized: true,
      confirmed: true,
    }),
  );
});

it('waits for the backend plan, reuses a lost-response receipt and resets approval on changes', async () => {
  vi.mocked(api).mockImplementation(async (path, _method, body: any) => {
    if (path === '/profiles') return profiles;
    return {
      preview_token: body.target,
      parameters: profiles[1],
      requires_confirmation: true,
      scope: 'included',
    };
  });
  const submit = vi.fn();
  render(
    <ScanForm
      pid="lab"
      initialTarget="127.0.0.1"
      initialProfile="full"
      busy={false}
      onSubmit={submit}
      onClose={() => {}}
    />,
  );
  await screen.findByText(/nmap · 1-65535/);
  expect(
    screen.getAllByRole('checkbox').every((input) => (input as HTMLInputElement).disabled),
  ).toBe(true);
  await screen.findByText(/Parameters checked against the saved project/);
  screen.getAllByRole('checkbox').forEach((input) => fireEvent.click(input));
  fireEvent.click(screen.getByRole('button', { name: 'Start scan' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start scan' }));
  expect(submit.mock.calls[0][0].request_id).toBe(submit.mock.calls[1][0].request_id);
  fireEvent.change(screen.getByLabelText('Target IPv4 address'), {
    target: { value: '127.0.0.2' },
  });
  for (const input of screen.getAllByRole('checkbox')) {
    expect(input).not.toBeChecked();
    expect(input).toBeDisabled();
  }
  await screen.findByText(/Parameters checked against the saved project/);
  screen.getAllByRole('checkbox').forEach((input) => fireEvent.click(input));
  fireEvent.click(screen.getByRole('button', { name: 'Start scan' }));
  expect(submit.mock.calls[2][0].request_id).not.toBe(submit.mock.calls[0][0].request_id);
  expect(submit.mock.calls[2][0].preview_token).toBe('127.0.0.2');
});
it('submits an explicitly approved wordlist for one web origin', async () => {
  const submit = vi.fn();
  render(
    <ScanForm
      initialTarget="http://127.0.0.1:8080/"
      initialProfile="ffuf"
      busy={false}
      onSubmit={submit}
      onClose={() => {}}
    />,
  );
  await screen.findByLabelText(/Wordlist/);
  fireEvent.change(screen.getByLabelText(/Wordlist/), { target: { value: 'admin\nrobots.txt' } });
  screen.getAllByRole('checkbox').forEach((el) => fireEvent.click(el));
  fireEvent.click(screen.getByRole('button', { name: 'Start scan' }));
  expect(submit).toHaveBeenCalledWith(
    expect.objectContaining({ profile: 'ffuf', words: ['admin', 'robots.txt'], confirmed: true }),
  );
});
it('persists queue concurrency and exposes API errors', async () => {
  render(<ReconSettings />);
  await screen.findByText(/Quick Scan · nmap/);
  fireEvent.change(screen.getByLabelText('Concurrent tasks'), { target: { value: '2' } });
  await waitFor(() => expect(api).toHaveBeenCalledWith('/queue', 'PUT', { concurrency: 2 }));
  vi.mocked(api).mockRejectedValueOnce(new Error('Profile is invalid'));
  fireEvent.change(screen.getByLabelText('Profile name'), { target: { value: 'Custom' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Profile is invalid');
});

it('loads history pages and resets pagination when a filter changes', async () => {
  const select = vi.fn();
  vi.mocked(api).mockResolvedValue({
    total: 70,
    items: [
      {
        id: 'old',
        target: '127.0.0.1',
        tool: 'nmap',
        status: 'completed',
        started: '2026-01-01',
        profile: 'quick',
      },
    ],
  });
  render(<ScanHistory pid="lab" revision="" onSelect={select} />);
  fireEvent.click(await screen.findByRole('button', { name: /127.0.0.1/ }));
  expect(select).toHaveBeenCalledWith('old');
  fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  await waitFor(() => expect(api).toHaveBeenCalledWith(expect.stringContaining('offset=50')));
  fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'failed' } });
  await waitFor(() =>
    expect(api).toHaveBeenLastCalledWith(expect.stringMatching(/status=failed.*offset=0/)),
  );
});
