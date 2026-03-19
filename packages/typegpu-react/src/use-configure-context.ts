import { useCallback, useEffect, useRef } from 'react';
import { useRoot } from './root-context.tsx';
import useEffectEvent from './use-effect-event.ts';

export interface UseConfigureContextOptions {
  /**
   * @default true
   */
  autoResize?: boolean;
}

export interface UseConfigureContextResult {
  canvasRefCallback: React.RefCallback<HTMLCanvasElement>;
  canvasRef: Readonly<React.RefObject<HTMLCanvasElement | null>>;
  ctxRef: React.RefObject<GPUCanvasContext | null>;
}

export function useConfigureContext(
  options?: UseConfigureContextOptions,
): UseConfigureContextResult {
  const { autoResize = true } = options ?? {};

  const root = useRoot();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const resizeEffect = useEffectEvent((entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    if (!canvasRef.current || !entry) {
      return;
    }

    const el = canvasRef.current;

    // Despite what the types say this property does not exist in Safari (hence the optional chaining).
    const dpcb = entry.devicePixelContentBoxSize?.[0] as ResizeObserverSize | undefined;

    const dpr = dpcb ? 1 : window.devicePixelRatio || 1;
    const box =
      dpcb ??
      (Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize);

    if (!box) {
      return;
    }

    el.width = Math.round(box.inlineSize * dpr);
    el.height = Math.round(box.blockSize * dpr);
  });

  const ctxRef = useRef<GPUCanvasContext>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  const canvasRefCallback = useCallback(
    (el: HTMLCanvasElement) => {
      if (el) {
        canvasRef.current = el;
        ctxRef.current = root.configureContext({ canvas: el, alphaMode: 'premultiplied' });
        if (autoResize) {
          if (resizeObserverRef.current) {
            resizeObserverRef.current.disconnect();
          }
          resizeObserverRef.current = new ResizeObserver(resizeEffect);
          resizeObserverRef.current.observe(el);
        }
      } else {
        canvasRef.current = null;
        ctxRef.current = null;
      }

      return () => {
        canvasRef.current = null;
        ctxRef.current = null;
        resizeObserverRef.current?.disconnect();
        resizeObserverRef.current = null;
      };
    },
    [root],
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) {
      return;
    }

    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }

    if (autoResize) {
      resizeObserverRef.current = new ResizeObserver(resizeEffect);
      resizeObserverRef.current.observe(el);
    }

    return () => {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    };
  }, [resizeEffect]);

  return { canvasRefCallback, canvasRef, ctxRef };
}
