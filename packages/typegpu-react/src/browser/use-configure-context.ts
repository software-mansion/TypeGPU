import { useRef } from 'react';
import { common } from 'typegpu';

import {
  createUseConfigureContextHook,
  type UseResizerHook,
} from '../core/use-configure-context.ts';
import { useRoot } from '../core/root-context.tsx';
import useStableEvent from '../core/use-stable-event.ts';

const useResizer: UseResizerHook = (onResize) => {
  const root = useRoot();
  const autoResizerRef = useRef<common.AutoResizer>(null);
  const observedRef = useRef<HTMLCanvasElement>(null);

  const attachResizing = useStableEvent((el: HTMLCanvasElement | OffscreenCanvas | null) => {
    if (el && 'clientWidth' in el) {
      // Both the ref callback and the mount effect attach resizing, no need to observe twice
      if (observedRef.current === el) {
        return;
      }
      autoResizerRef.current?.detach();
      autoResizerRef.current = common.attachAutoResizer({
        root,
        canvas: el,
        onResize: () => onResize(el.width, el.height),
      });
      observedRef.current = el;
    } else {
      autoResizerRef.current?.detach();
      autoResizerRef.current = null;
      observedRef.current = null;
    }
  });

  return { attachResizing };
};

export const useConfigureContext = createUseConfigureContextHook(useResizer);
