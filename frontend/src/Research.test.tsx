import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { api, uploadFile } from './api';
import { ImportsPage, ScopePage, WebMap } from './Research';
import type { Detail } from './api';
vi.mock('./api', () => ({ api: vi.fn(), uploadFile: vi.fn(), fetchEvidence: vi.fn() }));
const change = vi.fn(async () => {});
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api).mockImplementation(async (path) =>
    path.includes('observations') ? { total: 0, items: [] } : [],
  );
});

it('invalidates preview when scope choice changes and never applies before preview', async () => {
  render(<ImportsPage pid="p" onChanged={change} />);
  const apply = () => screen.queryByRole('button', { name: 'Import selected records' });
  expect(apply()).toBeNull();
  fireEvent.change(screen.getByLabelText('Tool export file'), {
    target: { files: [new File(['<items/>'], 'burp.xml')] },
  });
  vi.mocked(uploadFile).mockResolvedValueOnce({
    format: 'burp-items',
    sha256: 'abc',
    preview_token: 'preview',
    duplicate_run_id: null,
    warnings: ['Partial export'],
    summary: { selected: 1, new_objects: 3 },
    items: [
      {
        locator: 'item[1]',
        label: 'GET http://app.htb/',
        scope: 'unknown',
        selected: true,
        match: 'new',
      },
    ],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Preview import' }));
  expect(await screen.findByText('Partial export')).toBeVisible();
  expect(apply()).toBeEnabled();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(apply()).toBeNull();
  expect(uploadFile).toHaveBeenCalledTimes(1);
});

it('saves separate include and exclude target lists', async () => {
  render(<ScopePage pid="p" onChanged={change} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save scope' })).toBeEnabled());
  fireEvent.change(screen.getByLabelText('Included targets'), {
    target: { value: '10.10.10.0/24\napp.htb' },
  });
  fireEvent.change(screen.getByLabelText('Excluded targets'), { target: { value: '10.10.10.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save scope' }));
  await waitFor(() =>
    expect(api).toHaveBeenCalledWith('/projects/p/scope', 'PUT', {
      rules: [
        { value: '10.10.10.0/24', mode: 'include' },
        { value: 'app.htb', mode: 'include' },
        { value: '10.10.10.5', mode: 'exclude' },
      ],
    }),
  );
});

it('keeps vhosts separate and exposes method filters and linked investigation actions', async () => {
  const inspect = vi.fn(),
    knowledge = vi.fn();
  const detail = {
    project: { id: 'p', updated: 'now', created: 'now', name: 'Lab', description: '' },
    edges: [],
    scans: [],
    events: [],
    nodes: [
      {
        id: 'a',
        x: 0,
        y: 0,
        kind: 'application',
        label: 'http://app.htb',
        attrs: { origin: 'http://app.htb' },
      },
      {
        id: 'b',
        x: 0,
        y: 0,
        kind: 'application',
        label: 'http://admin.htb',
        attrs: { origin: 'http://admin.htb' },
      },
      {
        id: 'get',
        x: 0,
        y: 0,
        kind: 'endpoint',
        label: 'GET http://app.htb/login',
        attrs: { origin: 'http://app.htb', method: 'GET', url: 'http://app.htb/login' },
      },
      {
        id: 'post',
        x: 0,
        y: 0,
        kind: 'endpoint',
        label: 'POST http://app.htb/login',
        attrs: { origin: 'http://app.htb', method: 'POST', url: 'http://app.htb/login' },
      },
      {
        id: 'admin',
        x: 0,
        y: 0,
        kind: 'endpoint',
        label: 'GET http://admin.htb/private',
        attrs: { origin: 'http://admin.htb', method: 'GET', url: 'http://admin.htb/private' },
      },
    ],
  } as Detail;
  render(<WebMap detail={detail} onChanged={change} onInspect={inspect} onKnowledge={knowledge} />);
  fireEvent.change(screen.getByLabelText('Web application'), {
    target: { value: 'http://app.htb' },
  });
  expect(screen.getByRole('button', { name: 'POST http://app.htb/login' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /admin.htb\/private/ })).toBeNull();
  fireEvent.change(screen.getByLabelText('Endpoint method'), { target: { value: 'POST' } });
  expect(screen.queryByRole('button', { name: 'GET http://app.htb/login' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'POST http://app.htb/login' }));
  expect(await screen.findByLabelText('Create linked record type')).toBeVisible();
  fireEvent.change(screen.getByLabelText('Create linked record type'), {
    target: { value: 'finding' },
  });
  expect(screen.getByRole('button', { name: 'Create linked record' })).toBeEnabled();
});
