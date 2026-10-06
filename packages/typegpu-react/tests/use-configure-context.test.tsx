import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { useConfigureContext } from '@typegpu/react';
import {
  createUseConfigureContextHook,
  type UseResizerHook,
} from '../src/core/use-configure-context.ts';
import { it } from './utils/extended-test.tsx';

class MockResizeObserver {
  static instances: MockResizeObserver[] = [];
  target: Element | undefined;
  callback: ResizeObserverCallback;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    MockResizeObserver.instances.push(this);
  }

  observe(target: Element) {
    this.target = target;
  }

  disconnect() {
    this.target = undefined;
  }

  unobserve() {}

  resize(width: number, height: number) {
    const target = this.target;
    if (!target) {
      return;
    }
    this.callback(
      [
        {
          target,
          devicePixelContentBoxSize: [{ inlineSize: width, blockSize: height }],
        } as unknown as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver,
    );
  }
}

/** Resizes every canvas currently being observed */
function resizeAll(width: number, height: number) {
  act(() => {
    for (const observer of MockResizeObserver.instances) {
      observer.resize(width, height);
    }
  });
}

function Canvas({ onResize }: { onResize: (width: number, height: number) => void }) {
  const { ref } = useConfigureContext({ onResize });
  return <canvas ref={ref} />;
}

describe('useConfigureContext', () => {
  beforeEach(() => {
    MockResizeObserver.instances = [];
    vi.stubGlobal('ResizeObserver', MockResizeObserver);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      return { canvas: this, configure: vi.fn() } as unknown as GPUCanvasContext;
    } as unknown as HTMLCanvasElement['getContext']);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('calls onResize with the initial size once the canvas is available', ({ RootWrapper }) => {
    const onResize = vi.fn();
    render(<Canvas onResize={onResize} />, { wrapper: RootWrapper });

    expect(onResize).toHaveBeenCalledTimes(1);
    // Default HTML canvas size
    expect(onResize).toHaveBeenLastCalledWith(300, 150);
  });

  it('calls onResize on every resize', ({ RootWrapper }) => {
    const onResize = vi.fn();
    render(<Canvas onResize={onResize} />, { wrapper: RootWrapper });

    resizeAll(640, 480);
    expect(onResize).toHaveBeenCalledTimes(2);
    expect(onResize).toHaveBeenLastCalledWith(640, 480);

    resizeAll(800, 600);
    expect(onResize).toHaveBeenCalledTimes(3);
    expect(onResize).toHaveBeenLastCalledWith(800, 600);
  });

  it('does not call onResize when the size did not change', ({ RootWrapper }) => {
    const onResize = vi.fn();
    render(<Canvas onResize={onResize} />, { wrapper: RootWrapper });

    // The observer reports the initial size right after observing
    resizeAll(300, 150);
    expect(onResize).toHaveBeenCalledTimes(1);

    resizeAll(640, 480);
    resizeAll(640, 480);
    expect(onResize).toHaveBeenCalledTimes(2);
  });

  it('calls the latest onResize callback', ({ RootWrapper }) => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<Canvas onResize={first} />, { wrapper: RootWrapper });

    rerender(<Canvas onResize={second} />);
    resizeAll(640, 480);

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith(640, 480);
  });

  it('does not reconfigure the context or the resizing on re-render', ({ RootWrapper, root }) => {
    using configureContextSpy = vi.spyOn(root, 'configureContext');
    const { rerender } = render(<Canvas onResize={() => {}} />, { wrapper: RootWrapper });

    rerender(<Canvas onResize={() => {}} />);
    rerender(<Canvas onResize={() => {}} />);

    expect(configureContextSpy).toHaveBeenCalledTimes(1);
    expect(MockResizeObserver.instances).toHaveLength(1);
  });

  it('stops and resumes observing when autoResize is toggled', ({ RootWrapper }) => {
    function ToggleCanvas({ autoResize }: { autoResize: boolean }) {
      const { ref } = useConfigureContext({ autoResize });
      return <canvas ref={ref} />;
    }

    const { rerender } = render(<ToggleCanvas autoResize />, { wrapper: RootWrapper });
    expect(MockResizeObserver.instances.at(-1)?.target).toBeDefined();

    rerender(<ToggleCanvas autoResize={false} />);
    expect(MockResizeObserver.instances.every((observer) => !observer.target)).toBe(true);

    rerender(<ToggleCanvas autoResize />);
    expect(MockResizeObserver.instances).toHaveLength(2);
    expect(MockResizeObserver.instances.at(-1)?.target).toBeDefined();
  });

  it('does not pass onResize to the context configuration', ({ RootWrapper, root }) => {
    using configureContextSpy = vi.spyOn(root, 'configureContext');
    render(<Canvas onResize={() => {}} />, { wrapper: RootWrapper });

    expect(configureContextSpy).toHaveBeenCalledTimes(1);
    expect(configureContextSpy.mock.calls[0]?.[0]).not.toHaveProperty('onResize');
  });

  it('calls onResize once, with the context available, when the resizer reports synchronously', ({
    RootWrapper,
  }) => {
    // Mimics the React Native resizer, which sizes the canvas right when attaching
    const useSyncResizer: UseResizerHook = (onResize) => ({
      attachResizing: (el) => {
        if (el) {
          el.width = 123;
          el.height = 456;
          onResize(el.width, el.height);
        }
      },
    });
    const useSyncConfigureContext = createUseConfigureContextHook(useSyncResizer);

    const ctxAvailable: boolean[] = [];
    const onResize = vi.fn();
    function SyncCanvas() {
      const { ref, ctxRef } = useSyncConfigureContext({
        onResize: (width, height) => {
          ctxAvailable.push(ctxRef.current !== null);
          onResize(width, height);
        },
      });
      return <canvas ref={ref} />;
    }

    render(<SyncCanvas />, { wrapper: RootWrapper });

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenLastCalledWith(123, 456);
    expect(ctxAvailable).toEqual([true]);
  });
});
