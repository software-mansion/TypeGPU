import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { useConfigureContext } from '@typegpu/react';
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
    const observerCount = MockResizeObserver.instances.length;

    rerender(<Canvas onResize={() => {}} />);
    rerender(<Canvas onResize={() => {}} />);

    expect(configureContextSpy).toHaveBeenCalledTimes(1);
    expect(MockResizeObserver.instances).toHaveLength(observerCount);
  });

  it('does not pass onResize to the context configuration', ({ RootWrapper, root }) => {
    using configureContextSpy = vi.spyOn(root, 'configureContext');
    render(<Canvas onResize={() => {}} />, { wrapper: RootWrapper });

    expect(configureContextSpy).toHaveBeenCalledTimes(1);
    expect(configureContextSpy.mock.calls[0]?.[0]).not.toHaveProperty('onResize');
  });
});
