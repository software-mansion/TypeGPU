import { useEffect, useRef, type RefObject } from 'react';
import type { Shareable } from 'react-native-worklets';

import { useWorkletsDisabled } from '../core/root-context.tsx';
import type {
  UseConfigureContextOptions,
  UseConfigureContextResult,
} from '../core/use-configure-context.ts';
import { useConfigureContext as useRNConfigureContext } from './use-configure-context.ts';
import { getWorkletsModule } from './worklets-integration.ts';

type CanvasContext = GPUCanvasContext & { present?: () => void };

type ShareableContext = Shareable<
  CanvasContext | null,
  RefObject<CanvasContext | null>,
  RefObject<CanvasContext | null>
>;

function createShareableCtx(workletsDisabled: boolean): ShareableContext {
  const worklets = workletsDisabled ? null : getWorkletsModule();

  if (!worklets) {
    return {
      value: null as CanvasContext | null,
      get current() {
        return this.value as CanvasContext | null;
      },
      setSync(value: CanvasContext | null) {
        this.value = value;
      },
    } as ShareableContext;
  }

  return worklets.createShareable<
    CanvasContext | null,
    RefObject<CanvasContext | null>,
    RefObject<CanvasContext | null>
  >(worklets.UIRuntimeId, null, {
    initSynchronously: true,
    hostDecorator(shareable) {
      'worklet';
      Object.defineProperty(shareable, 'current', {
        get() {
          return shareable.value;
        },
        enumerable: true,
      });
      return shareable;
    },
    guestDecorator(shareable) {
      'worklet';
      Object.defineProperty(shareable, 'current', {
        get() {
          throw new Error(
            `[typegpu-react] ctxRef.current is only available on the UI runtime while Worklets integration is enabled. Access it inside a 'worklet' useFrame callback, or wrap this subtree in <Root disableWorklets>.`,
          );
        },
        enumerable: true,
      });
      return shareable;
    },
  });
}

/**
 * Same as `useConfigureContext`, but exposes the canvas context through a ref readable
 * on the UI runtime, or a same-shape JS-thread object when worklets are unavailable or
 * disabled. The choice is fixed on mount, flipping `disableWorklets` requires a remount
 */
export function useConfigureContext(
  options?: UseConfigureContextOptions,
): UseConfigureContextResult {
  const result = useRNConfigureContext(options);
  const workletsDisabled = useWorkletsDisabled();
  const shareableCtxRef = useRef<ShareableContext | undefined>(undefined);

  const shareableCtx = (shareableCtxRef.current ??= createShareableCtx(workletsDisabled));

  useEffect(() => {
    shareableCtx.setSync?.(result.ctxRef.current);
  });

  useEffect(() => {
    return () => {
      shareableCtx.setSync?.(null);
    };
  }, [shareableCtx]);

  return { ref: result.ref, ctxRef: shareableCtx };
}
