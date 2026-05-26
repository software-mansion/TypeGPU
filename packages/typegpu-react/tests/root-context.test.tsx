import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import tgpu from 'typegpu';
import type { TgpuRoot } from 'typegpu';
import { Root, useRootWithStatus } from '@typegpu/react';
import { useEffect } from 'react';
import { it } from './utils/extended-test.tsx';

describe('Root unmount cleanup', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should destroy own root on unmount (deferred cleanup)', async () => {
    let capturedRoot: TgpuRoot | undefined;

    function TestConsumer() {
      const result = useRootWithStatus();

      useEffect(() => {
        if (result.status === 'resolved') {
          capturedRoot = result.value;
        }
      });

      return null;
    }

    const { unmount } = render(
      <Root>
        <TestConsumer />
      </Root>,
    );

    // Flush microtasks so tgpu.init() resolves and React re-renders
    await act(async () => {
      await Promise.resolve();
    });

    expect(capturedRoot).toBeDefined();
    const destroySpy = vi.spyOn(capturedRoot!, 'destroy');

    unmount();
    vi.runAllTimers();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('should not throw when existing root unmounts', async ({ RootWrapper }) => {
    const { unmount } = render(<div />, { wrapper: RootWrapper });
    expect(() => unmount()).not.toThrow();
  });

  it('should destroy root when init promise resolves after unmount', async ({
    root: fixtureRoot,
  }) => {
    let resolveInit!: (root: TgpuRoot) => void;
    const initPromise = new Promise<TgpuRoot>((resolve) => {
      resolveInit = resolve;
    });

    using _initSpy = vi.spyOn(tgpu, 'init').mockReturnValue(initPromise as Promise<TgpuRoot>);
    const destroySpy = vi.spyOn(fixtureRoot, 'destroy');

    function TestConsumer() {
      useRootWithStatus();
      return null;
    }

    const { unmount } = render(
      <Root>
        <TestConsumer />
      </Root>,
    );

    // Unmount and run deferred cleanup before init resolves
    unmount();
    vi.runAllTimers();

    // Resolve init after context has been destroyed
    resolveInit(fixtureRoot);

    // Flush microtasks so the .then() callback runs
    await act(async () => {
      await Promise.resolve();
    });

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  describe('React StrictMode compatibility', () => {
    it('should survive the double mount/unmount cycle', async () => {
      let capturedRoot: TgpuRoot | undefined;

      function TestConsumer() {
        const result = useRootWithStatus();

        useEffect(() => {
          if (result.status === 'resolved') {
            capturedRoot = result.value;
          }
        });

        return null;
      }

      const { unmount } = render(
        <Root>
          <TestConsumer />
        </Root>,
        { reactStrictMode: true },
      );

      // Flush microtasks so tgpu.init() resolves and React re-renders
      await act(async () => {
        await Promise.resolve();
      });

      expect(capturedRoot).toBeDefined();

      // Run any pending deferred cleanup timeouts (from StrictMode's first mount)
      vi.runAllTimers();

      // Root should still be alive (deferred cleanup was cancelled by remount)
      const destroySpy = vi.spyOn(capturedRoot!, 'destroy');
      expect(destroySpy).not.toHaveBeenCalled();

      // Now actually unmount
      unmount();
      vi.runAllTimers();

      expect(destroySpy).toHaveBeenCalledTimes(1);
    });
  });
});
