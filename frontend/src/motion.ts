import { useEffect, useRef } from 'react';

type MotionPreference = { reduced_motion: boolean; performance_profile: string };

export function applyMotionPreference(value: MotionPreference) {
  document.documentElement.dataset.reducedMotion = String(
    value.reduced_motion || value.performance_profile === 'low',
  );
  window.dispatchEvent(new Event('dragontrip:motion'));
}

export function prefersReducedMotion() {
  return (
    document.documentElement.dataset.reducedMotion === 'true' ||
    Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  );
}

/** Animate the committed content without remounting editors or delaying navigation. */
export function usePageTransition(page: string, project: string | null, loading: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || loading || prefersReducedMotion() || !element.animate) return;
    const animation = element.animate(
      [
        { opacity: 0.3, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 180, easing: 'ease-out' },
    );
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const cancelIfReduced = () => {
      if (prefersReducedMotion()) animation.cancel();
    };
    window.addEventListener('dragontrip:motion', cancelIfReduced);
    media?.addEventListener?.('change', cancelIfReduced);
    return () => {
      animation.cancel();
      window.removeEventListener('dragontrip:motion', cancelIfReduced);
      media?.removeEventListener?.('change', cancelIfReduced);
    };
  }, [page, project, loading]);
  return ref;
}
