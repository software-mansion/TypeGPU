import { PixelRatio } from 'react-native';

import {
  createUseConfigureContextHook,
  type UseResizerHook,
} from '../core/use-configure-context.ts';
import useEffectEvent from '../core/use-effect-event.ts';

const useResizer: UseResizerHook = () => {
  const attachResizing = useEffectEvent((el: HTMLCanvasElement | OffscreenCanvas | null) => {
    // TODO: Listen for size changes and resize canvas
    if (el && 'clientWidth' in el) {
      el.width = el.clientWidth * PixelRatio.get();
      el.height = el.clientHeight * PixelRatio.get();
    }
  });

  return { attachResizing };
};

export const useConfigureContext = createUseConfigureContextHook(useResizer);
