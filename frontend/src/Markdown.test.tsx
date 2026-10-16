import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import Markdown from './Markdown';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn().mockResolvedValue(undefined) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('renders Markdown without executing HTML or loading remote images', () => {
  const { container } = render(
    <Markdown
      source={
        '# Evidence\n\n**Verified**\n\n- [x] Reviewed\n\n<script>alert(1)</script>\n\n![tracking](https://example.invalid/pixel.png)\n\n[unsafe](javascript:alert(1))'
      }
    />,
  );
  expect(screen.getByRole('heading', { name: 'Evidence' })).toBeVisible();
  expect(screen.getByText('Verified').tagName).toBe('STRONG');
  expect(screen.getByRole('checkbox')).toBeChecked();
  expect(container.querySelector('script,img,a[href^="javascript:"]')).toBeNull();
  expect(invoke).not.toHaveBeenCalled();
});

it('opens an HTTP link only on explicit user activation through native IPC', async () => {
  render(<Markdown source={'[Documentation](https://example.com/docs)'} />);
  expect(invoke).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('link', { name: 'Documentation' }));
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('open_external', { url: 'https://example.com/docs' }),
  );
});
