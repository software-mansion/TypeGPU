import React, { useCallback, useLayoutEffect, useRef } from 'react';

// oxlint-disable-next-line typescript/no-explicit-any -- makes the generic infer properly
type AnyFunction = (...params: any[]) => any;

/**
 * Fallback for React versions without `useEffectEvent`.
 * WARNING: Do not use in the render phase, nor in `useLayoutEffect` calls.
 */
function useStableEventFallback<TFunction extends AnyFunction>(handler: TFunction) {
  const handlerRef = useRef(handler);

  // In a real implementation, this would run before layout effects
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });

  return useCallback((...args: Parameters<TFunction>) => {
    // In a real implementation, this would throw if called during render
    const fn = handlerRef.current;
    return fn(...args);
  }, []) as TFunction;
}

const useEffectEvent = (React as { useEffectEvent?: typeof useStableEventFallback }).useEffectEvent;

/**
 * React's `useEffectEvent` returns a new function on every render, so it can't be
 * passed around as a ref callback, listed as an effect dependency, etc.
 * Each of those functions calls the latest `handler` though, so it's safe to
 * capture the first one with `useCallback` to get a stable reference.
 */
function useStableEventNative<TFunction extends AnyFunction>(handler: TFunction) {
  // oxlint-disable-next-line typescript/no-non-null-assertion -- only used when available
  const event = useEffectEvent!(handler);
  // Intentionally capturing the first event function, see above
  return useCallback((...args: Parameters<TFunction>) => event(...args), []) as TFunction;
}

/**
 * Like `useEffectEvent`, the returned function always calls the latest `handler`,
 * but its identity is stable across renders.
 * WARNING: Do not call it in the render phase, nor in `useLayoutEffect` calls.
 * @returns A stable reference of the passed in function.
 */
const useStableEvent = useEffectEvent ? useStableEventNative : useStableEventFallback;

export default useStableEvent;
