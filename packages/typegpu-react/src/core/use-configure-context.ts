import { useEffect, useRef } from 'react';

import { useRoot } from './root-context.tsx';
import useStableEvent from './use-stable-event.ts';
import { useChangeDetection } from './helper-hooks.ts';

/**
 * Only used to capture the canvas element. Has to be extremely vague to
 * encompass both the react-native-webgpu canvas, as well as the HTML canvas.
 */
export interface CanvasRef {
  getContext(contextName: 'webgpu'): CanvasContext | null;
}

export type UseConfigureContextOptions = Omit<GPUCanvasConfiguration, 'device' | 'format'> &
  Partial<Pick<GPUCanvasConfiguration, 'format'>> & {
    /**
     * @default true
     */
    autoResize?: boolean;
    /**
     * Called once the canvas becomes available, and then again every time its size changes.
     */
    onResize?: ((width: number, height: number) => void) | undefined;
  };

// react-native-webgpu requires you to call `present` on the canvas context
// submit the rendered frame, we reflect that on the type level
type CanvasContext = GPUCanvasContext & { present?: () => void };

export interface UseConfigureContextResult {
  ref: React.RefCallback<CanvasRef>;
  ctxRef: React.RefObject<CanvasContext | null>;
}

export interface Resizer {
  attachResizing: (el: HTMLCanvasElement | OffscreenCanvas | null) => void;
}

export type UseResizerHook = (onResize: (width: number, height: number) => void) => Resizer;

/*#__NO_SIDE_EFFECTS__*/
export function createUseConfigureContextHook(useResizer: UseResizerHook) {
  return function useConfigureContext(
    options?: UseConfigureContextOptions,
  ): UseConfigureContextResult {
    const { autoResize = true, onResize, ...restOptions } = options ?? {};

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<GPUCanvasContext>(null);
    const root = useRoot();
    const rootChanged = useChangeDetection(root);

    // If the root changed, and the context has been previously configured, we need to reconfigure it.
    if (rootChanged && ctxRef.current) {
      ctxRef.current.configure({
        device: root.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        ...restOptions,
      });
    }

    // Tracking the last reported canvas and its size, so that we only notify about actual changes
    const lastSizeRef = useRef<{ canvas: unknown; width: number; height: number } | null>(null);
    const notifyResize = useStableEvent((width: number, height: number) => {
      const canvas = canvasRef.current;
      const last = lastSizeRef.current;
      if (last && last.canvas === canvas && last.width === width && last.height === height) {
        return;
      }
      lastSizeRef.current = { canvas, width, height };
      onResize?.(width, height);
    });

    const { attachResizing } = useResizer(notifyResize);

    const canvasRefCallback = useStableEvent((el: HTMLCanvasElement | null) => {
      if (el) {
        const ctx = root.configureContext({ canvas: el, ...restOptions });
        // In react-native-webgpu, the canvas stored on the context is actually different than the canvas
        // the callback is called on. This one actually has properties like `clientWidth`.
        canvasRef.current = ctx.canvas as HTMLCanvasElement;
        ctxRef.current = ctx;
      } else {
        canvasRef.current = null;
        ctxRef.current = null;
      }

      // Attaching only after the refs are assigned, since resizers can report synchronously
      // (e.g. on React Native), and `onResize` should already be able to access the context.
      if (el && autoResize) {
        attachResizing(el);
      } else {
        attachResizing(null);
      }

      const ctx = ctxRef.current;
      if (ctx) {
        notifyResize(ctx.canvas.width, ctx.canvas.height);
      }

      return () => {
        canvasRef.current = null;
        ctxRef.current = null;
        attachResizing(null);
      };
    });

    useEffect(() => {
      if (autoResize) {
        attachResizing(canvasRef.current);
      } else {
        attachResizing(null);
      }

      return () => {
        attachResizing(null);
      };
    }, [attachResizing, autoResize]);

    return { ref: canvasRefCallback, ctxRef };
  };
}
