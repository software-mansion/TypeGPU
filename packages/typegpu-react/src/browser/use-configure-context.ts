import { useRef } from 'react';

import {
  createUseConfigureContextHook,
  type UseResizerHook,
} from '../core/use-configure-context.ts';
import useStableEvent from '../core/use-stable-event.ts';

const useResizer: UseResizerHook = (onResize) => {
  const resizeObserverRef = useRef<ResizeObserver>(null);
  const observedRef = useRef<HTMLCanvasElement>(null);

  const resizeEffect = useStableEvent((entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    if (!entry) {
      return;
    }

    const el = entry.target as HTMLCanvasElement;

    // Despite what the types say this property does not exist in Safari (hence the optional chaining).
    const dpcb = entry.devicePixelContentBoxSize?.[0];

    const dpr = dpcb ? 1 : window.devicePixelRatio || 1;
    const box =
      dpcb ??
      (Array.isArray(entry.contentBoxSize) ? entry.contentBoxSize[0] : entry.contentBoxSize);

    if (!box) {
      return;
    }

    el.width = Math.round(box.inlineSize * dpr);
    el.height = Math.round(box.blockSize * dpr);
    onResize(el.width, el.height);
  });

  const attachResizing = useStableEvent((el: HTMLCanvasElement | OffscreenCanvas | null) => {
    if (el && 'clientWidth' in el) {
      // Both the ref callback and the mount effect attach resizing, no need to observe twice
      if (observedRef.current === el) {
        return;
      }
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      resizeObserverRef.current = new ResizeObserver(resizeEffect);
      resizeObserverRef.current.observe(el);
      observedRef.current = el;
    } else {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      observedRef.current = null;
    }
  });

  return { attachResizing };
};

export const useConfigureContext = createUseConfigureContextHook(useResizer);
