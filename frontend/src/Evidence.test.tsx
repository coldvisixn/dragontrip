import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AttachmentLinks } from './Evidence';
import { api, uploadFile } from './api';
vi.mock('./api', () => ({ api: vi.fn(), uploadFile: vi.fn(), fetchEvidence: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
it('links an uploaded screenshot to the latest selection', async () => {
  vi.mocked(api).mockResolvedValue([]);
  let finish: (value: unknown) => void = () => {};
  vi.mocked(uploadFile).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const change = vi.fn();
  const view = render(<AttachmentLinks pid="lab" ids={['first']} onChange={change} />);
  fireEvent.change(screen.getByLabelText('Upload evidence'), {
    target: { files: [new File(['image'], 'proof.png', { type: 'image/png' })] },
  });
  view.rerender(<AttachmentLinks pid="lab" ids={['first', 'second']} onChange={change} />);
  finish({ id: 'uploaded', filename: 'proof.png', size: 5 });
  await waitFor(() => expect(change).toHaveBeenCalledWith(['first', 'second', 'uploaded']));
});
it('does not mutate a closed editor when an upload finishes', async () => {
  vi.mocked(api).mockResolvedValue([]);
  let finish: (value: unknown) => void = () => {};
  vi.mocked(uploadFile).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const change = vi.fn();
  const view = render(<AttachmentLinks pid="lab" ids={[]} onChange={change} />);
  fireEvent.change(screen.getByLabelText('Upload evidence'), {
    target: { files: [new File(['image'], 'proof.png', { type: 'image/png' })] },
  });
  view.unmount();
  finish({ id: 'uploaded', filename: 'proof.png', size: 5 });
  await Promise.resolve();
  expect(change).not.toHaveBeenCalled();
});
