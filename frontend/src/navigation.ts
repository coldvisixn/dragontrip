import { useCallback, useState } from 'react';

export function useNavigation<T extends string>(initial: T) {
  const [history, setHistory] = useState({ entries: [initial], index: 0 });
  const navigate = useCallback(
    (page: T) =>
      setHistory((current) =>
        current.entries[current.index] === page
          ? current
          : {
              entries: [...current.entries.slice(0, current.index + 1), page].slice(-100),
              index: Math.min(current.index + 1, 99),
            },
      ),
    [],
  );
  const back = useCallback(
    () => setHistory((current) => ({ ...current, index: Math.max(0, current.index - 1) })),
    [],
  );
  const forward = useCallback(
    () =>
      setHistory((current) => ({
        ...current,
        index: Math.min(current.entries.length - 1, current.index + 1),
      })),
    [],
  );
  return {
    page: history.entries[history.index],
    navigate,
    back,
    forward,
    canBack: history.index > 0,
    canForward: history.index < history.entries.length - 1,
  };
}
