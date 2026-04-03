import { useRef } from 'react';

import {
  createUseConfigureContextHook,
  type AbstractCanvasElement,
  type UseResizerHook,
} from '../core/use-configure-context.ts';
import useEffectEvent from '../core/use-effect-event.ts';

const useResizer: UseResizerHook = () => {
  const resizeObserverRef = useRef<ResizeObserver>(null);

  const resizeEffect = useEffectEvent((entries: ResizeObserverEntry[]) => {
    const entry = entries[0];
    if (!entry) {
      return;
    }

    const el = entry.target as HTMLCanvasElement;

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

  const attachResizing = useEffectEvent((el: AbstractCanvasElement | null) => {
    if (el) {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      resizeObserverRef.current = new ResizeObserver(resizeEffect);
      resizeObserverRef.current.observe(el as HTMLCanvasElement);
    } else {
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
    }
  });

  return { attachResizing };
};

export const useConfigureContext = createUseConfigureContextHook(useResizer);
