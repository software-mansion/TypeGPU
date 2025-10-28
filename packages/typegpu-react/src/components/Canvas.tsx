import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  CanvasContext,
  type CanvasContextValue,
} from '../context/canvas-context.ts';
import { useRoot } from '../hooks/use-root.ts';

export function Canvas({ children }: { children: React.ReactNode }) {
  const root = useRoot();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasCtxRef = useRef<GPUCanvasContext>(null);

  const frameCallbacksRef = useRef(new Set<(time: number) => void>());

  const [contextValue] = useState<CanvasContextValue>(() => ({
    get context() {
      return canvasCtxRef.current;
    },
    addFrameCallback(cb: (time: number) => void) {
      frameCallbacksRef.current.add(cb);
      return () => frameCallbacksRef.current.delete(cb);
    },
  }));

  useEffect(() => {
    if (!canvasRef.current) return;

    let disposed = false;
    const canvas = canvasRef.current;
    const context = canvas.getContext('webgpu');
    if (!context) {
      console.error('WebGPU not supported');
      return;
    }

    const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device: root.device,
      format: presentationFormat,
      alphaMode: 'premultiplied',
    });
    canvasCtxRef.current = context;

    const frame = (time: number) => {
      if (disposed) return;
      requestAnimationFrame(frame);

      frameCallbacksRef.current.forEach((cb) => {
        cb(time);
      });

      root['~unstable'].flush();
    };
    requestAnimationFrame(frame);

    return () => {
      disposed = true;
    };
  }, [root]);

  return (
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}>
      <CanvasContext.Provider value={contextValue}>
        {children}
      </CanvasContext.Provider>
    </canvas>
  );
}
