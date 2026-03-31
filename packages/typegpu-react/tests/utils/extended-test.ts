import { act, renderHook } from '@testing-library/react';
import { test as base } from 'typegpu-testing-utility';
import { useRoot } from '@typegpu/react';
import { TgpuRoot } from 'typegpu';

export const test = base.extend<{ globalRoot: TgpuRoot }>({
  globalRoot: async ({ task }, use) => {
    const { result } = await act(() => renderHook(() => useRoot()));
    await use(result.current);
  },
});

export const it = test;
