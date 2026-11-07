import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, vi } from 'vitest';
import { useConfigureContext } from '@typegpu/react';
import {
  type CanvasRef,
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

  it('corrects the canvas size when it was changed externally, even if the observed size did not change', ({
    RootWrapper,
  }) => {
    const onResize = vi.fn();
    function ToggleCanvas({ autoResize }: { autoResize: boolean }) {
      const { ref } = useConfigureContext({ autoResize, onResize });
      return <canvas ref={ref} />;
    }

    const { rerender, container } = render(<ToggleCanvas autoResize />, { wrapper: RootWrapper });
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;
    resizeAll(640, 480);
    expect(canvas.width).toBe(640);

    rerender(<ToggleCanvas autoResize={false} />);
    canvas.width = 1000;

    rerender(<ToggleCanvas autoResize />);
    resizeAll(640, 480);

    expect(canvas.width).toBe(640);
    expect(canvas.height).toBe(480);
    expect(onResize).toHaveBeenLastCalledWith(640, 480);
  });

  it('calls onResize when externally changed dimensions match the newly observed size', ({
    RootWrapper,
  }) => {
    const onResize = vi.fn();
    const { container } = render(<Canvas onResize={onResize} />, { wrapper: RootWrapper });
    const canvas = container.querySelector('canvas') as HTMLCanvasElement;

    resizeAll(640, 480);
    expect(onResize).toHaveBeenLastCalledWith(640, 480);
    onResize.mockClear();

    // An external writer changes the attributes before the observer reports the new layout size.
    canvas.width = 800;
    canvas.height = 600;
    resizeAll(800, 600);

    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenLastCalledWith(800, 600);
  });

  it('does not call onResize again when the observed size is unchanged', ({ RootWrapper }) => {
    const onResize = vi.fn();
    render(<Canvas onResize={onResize} />, { wrapper: RootWrapper });

    resizeAll(640, 480);
    onResize.mockClear();
    resizeAll(640, 480);

    expect(onResize).not.toHaveBeenCalled();
  });

  it('does not pass onResize to the context configuration', ({ RootWrapper, root }) => {
    using configureContextSpy = vi.spyOn(root, 'configureContext');
    render(<Canvas onResize={() => {}} />, { wrapper: RootWrapper });

    expect(configureContextSpy).toHaveBeenCalledTimes(1);
    expect(configureContextSpy.mock.calls[0]?.[0]).not.toHaveProperty('onResize');
  });

  it("attaches resizing to the context's canvas, when it differs from the ref element", ({
    RootWrapper,
  }) => {
    // Mimics react-native-webgpu, where only the context's canvas can be measured
    const nativeCanvas = { width: 300, height: 150, clientWidth: 100, clientHeight: 50 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      return { canvas: nativeCanvas, configure: vi.fn() } as unknown as GPUCanvasContext;
    } as unknown as HTMLCanvasElement['getContext']);

    const attachedTo: unknown[] = [];
    const useMeasuringResizer: UseResizerHook = (onResize) => ({
      attachResizing: (el) => {
        attachedTo.push(el);
        if (el && 'clientWidth' in el) {
          onResize(el.clientWidth * 2, el.clientHeight * 2);
        }
      },
    });
    const useMeasuringConfigureContext = createUseConfigureContextHook(useMeasuringResizer);

    const onResize = vi.fn();
    function MeasuringCanvas() {
      const { ref } = useMeasuringConfigureContext({ onResize });
      return <canvas ref={ref} />;
    }

    render(<MeasuringCanvas />, { wrapper: RootWrapper });

    expect(attachedTo.filter(Boolean).every((el) => el === nativeCanvas)).toBe(true);
    expect(nativeCanvas.width).toBe(200);
    expect(nativeCanvas.height).toBe(100);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenLastCalledWith(200, 100);
  });

  it('calls onResize once, with the context available, when the resizer reports synchronously', ({
    RootWrapper,
  }) => {
    // Mimics the React Native resizer, which reports the size right when attaching
    const useSyncResizer: UseResizerHook = (onResize) => ({
      attachResizing: (el) => {
        if (el) {
          onResize(123, 456);
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

    const { container } = render(<SyncCanvas />, { wrapper: RootWrapper });
    const canvas = container.querySelector('canvas');

    expect(canvas?.width).toBe(123);
    expect(canvas?.height).toBe(456);
    expect(onResize).toHaveBeenCalledTimes(1);
    expect(onResize).toHaveBeenLastCalledWith(123, 456);
    expect(ctxAvailable).toEqual([true]);
  });

  it('notifies about the new context when the same canvas is re-attached', ({ RootWrapper }) => {
    const contexts: GPUCanvasContext[] = [];
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
      this: HTMLCanvasElement,
    ) {
      const ctx = { canvas: this, configure: vi.fn() } as unknown as GPUCanvasContext;
      contexts.push(ctx);
      return ctx;
    } as unknown as HTMLCanvasElement['getContext']);

    const notifiedContexts: (GPUCanvasContext | null)[] = [];
    let refCallback: React.RefCallback<CanvasRef> | undefined;
    function ManualCanvas() {
      const { ref, ctxRef } = useConfigureContext({
        onResize: () => notifiedContexts.push(ctxRef.current),
      });
      refCallback = ref;
      return null;
    }

    render(<ManualCanvas />, { wrapper: RootWrapper });

    // Mimics StrictMode, which attaches, cleans up and re-attaches the same element
    const el = document.createElement('canvas');
    act(() => {
      const cleanup = refCallback?.(el);
      if (typeof cleanup === 'function') {
        cleanup();
      }
      refCallback?.(el);
    });

    expect(contexts).toHaveLength(2);
    expect(notifiedContexts).toEqual([contexts[0], contexts[1]]);
  });

  describe('when the canvas options change after mount', () => {
    let configure: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      configure = vi.fn();
      vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (
        this: HTMLCanvasElement,
      ) {
        return { canvas: this, configure } as unknown as GPUCanvasContext;
      } as unknown as HTMLCanvasElement['getContext']);
    });

    function OptionsCanvas({ transparent }: { transparent: boolean }) {
      const { ref } = useConfigureContext({
        alphaMode: transparent ? 'premultiplied' : 'opaque',
        // A new array on every render, with the same contents
        viewFormats: ['bgra8unorm-srgb'],
      });
      return <canvas ref={ref} />;
    }

    it('reconfigures the context with the new options', ({ RootWrapper, root }) => {
      const { rerender } = render(<OptionsCanvas transparent={false} />, {
        wrapper: RootWrapper,
      });
      expect(configure).toHaveBeenCalledTimes(1);
      expect(configure).toHaveBeenLastCalledWith(
        expect.objectContaining({ alphaMode: 'opaque', device: root.device }),
      );

      rerender(<OptionsCanvas transparent />);

      expect(configure).toHaveBeenCalledTimes(2);
      expect(configure).toHaveBeenLastCalledWith(
        expect.objectContaining({
          alphaMode: 'premultiplied',
          viewFormats: ['bgra8unorm-srgb'],
          device: root.device,
        }),
      );
    });

    it('does not reconfigure when the options are equal by value', ({ RootWrapper }) => {
      const { rerender } = render(<OptionsCanvas transparent={false} />, {
        wrapper: RootWrapper,
      });

      rerender(<OptionsCanvas transparent={false} />);
      rerender(<OptionsCanvas transparent={false} />);

      expect(configure).toHaveBeenCalledTimes(1);
    });

    it('reconfigures when a nested option changes', ({ RootWrapper }) => {
      function ToneMappedCanvas({ mode }: { mode: GPUCanvasToneMappingMode }) {
        const { ref } = useConfigureContext({ toneMapping: { mode } });
        return <canvas ref={ref} />;
      }

      const { rerender } = render(<ToneMappedCanvas mode="standard" />, {
        wrapper: RootWrapper,
      });
      rerender(<ToneMappedCanvas mode="standard" />);
      expect(configure).toHaveBeenCalledTimes(1);

      rerender(<ToneMappedCanvas mode="extended" />);
      expect(configure).toHaveBeenCalledTimes(2);
      expect(configure).toHaveBeenLastCalledWith(
        expect.objectContaining({ toneMapping: { mode: 'extended' } }),
      );
    });
  });
});
