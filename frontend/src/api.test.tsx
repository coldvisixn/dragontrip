import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { saveArtifact } from './api';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('turns a native filesystem rejection into a visible Error', async () => {
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === 'backend_connection') return { port: 12345, token: 'test-session-token' };
    throw 'Downloads directory is not writable';
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: async () => '<nmaprun/>' }));
  await expect(saveArtifact('scan-id')).rejects.toThrow('Downloads directory is not writable');
});
