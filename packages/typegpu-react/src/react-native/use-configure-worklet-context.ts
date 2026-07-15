import { useEffect, useRef } from 'react';
import { createShareable, UIRuntimeId } from 'react-native-worklets';

import type { CanvasRef, UseConfigureContextOptions } from '../core/use-configure-context.ts';
import { useConfigureContext } from './use-configure-context.ts';

type CanvasContext = GPUCanvasContext & { present?: () => void };

export type WorkletCanvasContextRef = {
  value: CanvasContext | null;
  setSync(value: CanvasContext | null): void;
};

export function useConfigureWorkletContext(options?: UseConfigureContextOptions): {
  ref: React.RefCallback<CanvasRef>;
  ctxRef: WorkletCanvasContextRef;
} {
  const result = useConfigureContext(options);
  const workletCtxRef = useRef<WorkletCanvasContextRef | undefined>(undefined);
  workletCtxRef.current ??= createShareable<CanvasContext | null>(UIRuntimeId, null, {
    initSynchronously: true,
  }) as WorkletCanvasContextRef;

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
