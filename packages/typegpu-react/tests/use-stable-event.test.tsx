import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import useStableEvent from '../src/core/use-stable-event.ts';

describe('useStableEvent', () => {
  it('returns the same function across renders', () => {
    const { result, rerender } = renderHook(({ value }) => useStableEvent(() => value), {
      initialProps: { value: 1 },
    });
    const first = result.current;

    rerender({ value: 2 });

    expect(result.current).toBe(first);
  });

  it('calls the latest handler', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();
    const { result, rerender } = renderHook(({ handler }) => useStableEvent(handler), {
      initialProps: { handler: firstHandler },
    });
    const stable = result.current;

    rerender({ handler: secondHandler });
    stable(1, 2);

    expect(firstHandler).not.toHaveBeenCalled();
    expect(secondHandler).toHaveBeenCalledWith(1, 2);
  });
});
