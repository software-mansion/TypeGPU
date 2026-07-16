import { useEffect, useRef } from 'react';

import { useWorkletsDisabled } from '../core/root-context.tsx';
import type { CanvasRef, UseConfigureContextOptions } from '../core/use-configure-context.ts';
import { useConfigureContext } from './use-configure-context.ts';
import { getWorkletsModule } from './worklets-integration.ts';

type CanvasContext = GPUCanvasContext & { present?: () => void };

export type WorkletCanvasContextRef = {
  value: CanvasContext | null;
  setSync(value: CanvasContext | null): void;
};

/**
 * Same as `useConfigureContext`, but exposes the canvas context through a ref readable
 * on the UI runtime, or a same-shape JS-thread object when worklets are unavailable or
 * disabled. The choice is fixed on mount, flipping `disableWorklets` requires a remount
 */
export function useConfigureWorkletContext(options?: UseConfigureContextOptions): {
  ref: React.RefCallback<CanvasRef>;
  ctxRef: WorkletCanvasContextRef;
} {
  const result = useConfigureContext(options);
  const workletsDisabled = useWorkletsDisabled();
  const workletCtxRef = useRef<WorkletCanvasContextRef | undefined>(undefined);

  if (workletCtxRef.current === undefined) {
    const worklets = workletsDisabled ? null : getWorkletsModule();
    workletCtxRef.current = worklets
      ? (worklets.createShareable<CanvasContext | null>(worklets.UIRuntimeId, null, {
          initSynchronously: true,
        }) as WorkletCanvasContextRef)
      : {
          value: null,
          setSync(value) {
            this.value = value;
          },
        };
  }

  const ctxRef = workletCtxRef.current;

  useEffect(() => {
    ctxRef.setSync(result.ctxRef.current);
  });

  useEffect(() => {
    return () => {
      ctxRef.setSync(null);
    };
  }, [ctxRef]);

  return { ref: result.ref, ctxRef };
}
