import { useRoot } from '../context/root-context';
import { useRef, useEffect } from 'react';

export function Canvas({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const root = useRoot();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;

    const ctx = canvas.getContext('webgpu') as GPUCanvasContext;
    ctx.configure({
      device: root.device,
      format: navigator.gpu.getPreferredCanvasFormat(),
    });
  }, [root]);

  return <canvas ref={ref}>{children}</canvas>;
}
