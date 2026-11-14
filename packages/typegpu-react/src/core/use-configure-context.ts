import { useEffect, useLayoutEffect, useRef } from 'react';

import { useRoot } from './root-context.tsx';
import useStableEvent from './use-stable-event.ts';
import { valuesEqual } from './helper-hooks.ts';

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
     * Called once the canvas becomes available, again every time its size changes, and every
     * time the context is reconfigured because the root or the options changed (reconfiguring
     * clears the canvas, so this is where to redraw).
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
    const { autoResize = true, onResize: onResizeUserCallback, ...restOptions } = options ?? {};

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<GPUCanvasContext>(null);
    const root = useRoot();
    // The root and options the current context was last configured with
    const configuredRef = useRef<{ root: typeof root; options: typeof restOptions } | null>(null);

    // The size last reported to the user, reset on every attachment so that each new context gets
    // its initial notification
    const lastNotifiedRef = useRef<{ width: number; height: number } | null>(null);
    const notify = (width: number, height: number) => {
      lastNotifiedRef.current = { width, height };
      onResizeUserCallback?.(width, height);
    };

    const onResize = useStableEvent((width: number, height: number) => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return;
      }

      // Comparing against the canvas' actual size, so that the canvas gets corrected even if
      // something else changed its size in the meantime
      const corrected = canvas.width !== width || canvas.height !== height;
      if (corrected) {
        canvas.width = width;
        canvas.height = height;
      }

      // Comparing against the last notified size as well, since something else could have
      // resized the canvas to exactly the reported size (which still clears it)
      const last = lastNotifiedRef.current;
      if (corrected || !last || last.width !== canvas.width || last.height !== canvas.height) {
        notify(canvas.width, canvas.height);
      }
    });

    const { attachResizing } = useResizer(onResize);

    const canvasRefCallback = useStableEvent((el: HTMLCanvasElement | null) => {
      if (!el) {
        canvasRef.current = null;
        ctxRef.current = null;
        attachResizing(null);
        return;
      }

      const ctx = root.configureContext({ canvas: el, ...restOptions });
      // In react-native-webgpu, the canvas stored on the context is actually different than the canvas
      // the callback is called on. This one actually has properties like `clientWidth`.
      const canvas = ctx.canvas as HTMLCanvasElement;
      canvasRef.current = canvas;
      ctxRef.current = ctx;
      configuredRef.current = { root, options: restOptions };
      lastNotifiedRef.current = null;

      // Attaching only after the refs are assigned, since resizers can report synchronously
      // (e.g. on React Native), and `onResize` should already be able to access the context.
      // Attaching to the context's canvas, since that's the one that can be measured.
      attachResizing(autoResize ? canvas : null);

      // If the resizer didn't already notify, notify about the initial size
      if (!lastNotifiedRef.current) {
        notify(canvas.width, canvas.height);
      }

      return () => {
        canvasRef.current = null;
        ctxRef.current = null;
        attachResizing(null);
      };
    });

    // If the root or the canvas options changed since the context was configured, reconfigure it.
    // This runs after commit rather than during render, so a render React discards never reaches
    // the context, and so the user callback below is not called from render.
    useLayoutEffect(() => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      const configured = configuredRef.current;
      // Options are compared by value, since the options object (and arrays like `viewFormats`)
      // is recreated on every render
      if (
        !ctx ||
        !canvas ||
        !configured ||
        (configured.root === root && valuesEqual(configured.options, restOptions))
      ) {
        return;
      }

      ctx.configure({
        device: root.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        ...restOptions,
      });
      configuredRef.current = { root, options: restOptions };
      // Reconfiguring replaces the drawing buffer with a blank one, and the size did not change,
      // so the resizer will not report it: notify so that the user can redraw.
      notify(canvas.width, canvas.height);
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
