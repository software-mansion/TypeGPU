import React, { useCallback, useLayoutEffect, useRef } from 'react';

/**
 * Polyfill for the `useEffectEvent` React hook.
 * WARNING: Do not use in the render phase, nor in `useLayoutEffect` calls.
 * @param handler
 * @returns A stable reference of the passed in function.
 */

// oxlint-disable-next-line typescript/no-explicit-any -- makes the generic infer properly
function useEffectEvent<TFunction extends (...params: any[]) => any>(handler: TFunction) {
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

export default (React as { useEffectEvent?: typeof useEffectEvent }).useEffectEvent ??
  useEffectEvent;
