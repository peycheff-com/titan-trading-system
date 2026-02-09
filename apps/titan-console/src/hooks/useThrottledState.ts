import { useState, useRef, useEffect, useCallback } from 'react';

/**
 * useThrottledState
 *
 * A drop-in replacement for useState that throttles updates to
 * requestAnimationFrame (RAF), preventing render storms from
 * high-frequency WebSocket streams.
 *
 * @param initialState Initial state value
 * @param throttleMs Minimum time between updates (optional, defaults to RAF)
 */
export function useThrottledState<T>(
  initialState: T,
  throttleMs: number = 0,
): [T, (newValue: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(initialState);
  const nextState = useRef<T>(initialState);
  const pending = useRef(false);
  const lastUpdate = useRef(0);

  const setThrottledState = useCallback(
    (newValue: T | ((prev: T) => T)) => {
      // Resolve functional updates immediately against the *latest pending* state
      // (not the committed React state, which might be stale)
      const resolved =
        newValue instanceof Function ? newValue(nextState.current) : newValue;

      nextState.current = resolved;

      if (!pending.current) {
        pending.current = true;

        const attemptUpdate = () => {
          const now = Date.now();
          const timeSinceLast = now - lastUpdate.current;

          if (timeSinceLast >= throttleMs) {
            setState(nextState.current);
            lastUpdate.current = now;
            pending.current = false;
          } else {
            // Re-schedule if throttled
            requestAnimationFrame(attemptUpdate);
          }
        };

        requestAnimationFrame(attemptUpdate);
      }
    },
    [throttleMs],
  );

  // Cleanup on unmount not strictly needed as RAF is benign, 
  // but good practice to avoid setting state on unmounted
  useEffect(() => {
    return () => {
      pending.current = false;
    };
  }, []);

  return [state, setThrottledState];
}
