import { useEffect, useRef } from 'react';

import { useRoot } from './root-context.tsx';
import useEffectEvent from './use-effect-event.ts';
import { useChangeDetection } from './helper-hooks.ts';

/**
 * Only used to capture the canvas element. Has to be extremely vague to
 * encompass both the react-native-wgpu canvas, as well as the HTML canvas.
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
  };

// react-native-wgpu requires you to call `present` on the canvas context
// submit the rendered frame, we reflect that on the type level
type CanvasContext = GPUCanvasContext & { present?: () => void };

export interface UseConfigureContextResult {
  ref: React.RefCallback<CanvasRef>;
  ctxRef: React.RefObject<CanvasContext | null>;
}

export interface Resizer {
  attachResizing: (el: HTMLCanvasElement | OffscreenCanvas | null) => void;
}

export type UseResizerHook = () => Resizer;

export function createUseConfigureContextHook(useResizer: UseResizerHook) {
  return function useConfigureContext(
    options?: UseConfigureContextOptions,
  ): UseConfigureContextResult {
    const { autoResize = true, ...restOptions } = options ?? {};

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const ctxRef = useRef<GPUCanvasContext>(null);
    const root = useRoot();
    const rootChanged = useChangeDetection(root);

    // If the root changed, and the context as been previously configured, we need to reconfigure it.
    if (rootChanged && ctxRef.current) {
      ctxRef.current.configure({
        device: root.device,
        format: navigator.gpu.getPreferredCanvasFormat(),
        ...restOptions,
      });
    }

    const { attachResizing } = useResizer();

    const canvasRefCallback = useEffectEvent((el: HTMLCanvasElement | null) => {
      if (el && autoResize) {
        attachResizing(el);
      } else {
        attachResizing(null);
      }

      if (el) {
        canvasRef.current = el;
        ctxRef.current = root.configureContext({ canvas: el, ...restOptions });
      } else {
        canvasRef.current = null;
        ctxRef.current = null;
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
