import { useEffect, useState } from 'react';

/**
 * Return `value` only after it has stopped changing for `delayMs`.
 *
 * Used by type-ahead fields so a server round-trip is made per pause in typing
 * rather than per keystroke. The first value is returned immediately, so an
 * initial render never waits for the delay to elapse.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    if (value === debounced) return;
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, debounced, delayMs]);

  return debounced;
}
