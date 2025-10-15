import type React from 'react';
import {
  useEffect,
  useRef,
  useState,
} from 'react';
import tgpu, { type TgpuRoot } from 'typegpu';
import { CanvasContext, type CanvasContextValue } from '../context/canvas-context.ts';

export function Canvas({ children }: { children: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [contextValue, setContextValue] = useState<CanvasContextValue | null>(
    null,
  );
  const frameCallbacks = useRef(new Set<(time: number) => void>()).current;

  useEffect(() => {
    let root: TgpuRoot;
    let animationFrameId: number;
    let disposed = false;

    const init = async () => {
      if (!canvasRef.current) return;
      const canvas = canvasRef.current;
      root = await tgpu.init();
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

      const addFrameCallback = (cb: (time: number) => void) => {
        frameCallbacks.add(cb);
        return () => frameCallbacks.delete(cb);
      };

      setContextValue({ root, context, addFrameCallback });

      const frame = (time: number) => {
        if (disposed) return;
        frameCallbacks.forEach((cb) => cb(time));
        root['~unstable'].flush();
        animationFrameId = requestAnimationFrame(frame);
      };
      animationFrameId = requestAnimationFrame(frame);
    };

    init();

    return () => {
      disposed = true;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
      if (root) {
        root.destroy();
      }
    };
  }, [frameCallbacks]);

  return (
    <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }}>
      {contextValue && (
        <CanvasContext.Provider value={contextValue}>
          {children}
        </CanvasContext.Provider>
      )}
    </canvas>
  );
}