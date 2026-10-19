import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { applyMotionPreference, usePageTransition } from './motion';

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.reducedMotion;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function Page({ page, loading = false }: { page: string; loading?: boolean }) {
  const ref = usePageTransition(page, 'project', loading);
  return (
    <main ref={ref}>
      <input defaultValue="unsaved text" />
    </main>
  );
}
function animationMock() {
  const cancel = vi.fn();
  const animate = vi.fn(() => ({ cancel }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
  return { animate, cancel };
}

it('animates committed tab changes without remounting drafts, and cancels when reduced motion is enabled', () => {
  const { animate, cancel } = animationMock();
  const view = render(<Page page="Notes" />);
  const input = view.container.querySelector('input');
  view.rerender(<Page page="Findings" />);
  expect(animate).toHaveBeenCalledTimes(2);
  expect(view.container.querySelector('input')).toBe(input);
  cancel.mockClear();
  act(() => applyMotionPreference({ reduced_motion: true, performance_profile: 'medium' }));
  expect(cancel).toHaveBeenCalledOnce();
  view.rerender(<Page page="Reports" />);
  expect(animate).toHaveBeenCalledTimes(2);
});

it('skips transitions for loading, Low performance and the system reduced-motion preference', () => {
  const { animate } = animationMock();
  const view = render(<Page page="Notes" loading />);
  expect(animate).not.toHaveBeenCalled();
  applyMotionPreference({ reduced_motion: false, performance_profile: 'low' });
  view.rerender(<Page page="Notes" />);
  expect(animate).not.toHaveBeenCalled();
  applyMotionPreference({ reduced_motion: false, performance_profile: 'medium' });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
  view.rerender(<Page page="Reports" />);
  expect(animate).not.toHaveBeenCalled();
});

it('cancels an in-flight transition when the system changes its motion preference', () => {
  const { animate, cancel } = animationMock();
  let reduced = false;
  const media = new EventTarget();
  Object.defineProperty(media, 'matches', { get: () => reduced });
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => media),
  );
  render(<Page page="Notes" />);
  expect(animate).toHaveBeenCalledOnce();
  reduced = true;
  act(() => media.dispatchEvent(new Event('change')));
  expect(cancel).toHaveBeenCalledOnce();
});
