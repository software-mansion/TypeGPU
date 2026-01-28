import { useEffect, useRef } from 'react';
import { ChartNoAxesColumn } from 'lucide-react';

/**
 * FPS Counter component, displays FPS and frame time in a small overlay.
 */
export function FPSCounter() {
  const fpsRef = useRef<HTMLSpanElement>(null);
  const frameTimeRef = useRef<HTMLSpanElement>(null);
  const metricsRef = useRef({
    frames: [] as number[],
    lastTime: 0,
    lastUpdate: 0,
  });
  const AVG_FRAME_WINDOW = 100;
  const POOLING_LENGTH = 60;

  useEffect(() => {
    let rafId: number;

    const loop = (time: DOMHighResTimeStamp) => {
      rafId = requestAnimationFrame(loop);

      const metrics = metricsRef.current;
      if (!metrics.lastTime) {
        metrics.lastTime = metrics.lastUpdate = time;
        return;
      }

      metrics.frames.push(time - metrics.lastTime);
      metrics.lastTime = time;

      if (metrics.frames.length > POOLING_LENGTH) {
        metrics.frames.shift();
      }

      if (
        time - metrics.lastUpdate >= AVG_FRAME_WINDOW &&
        metrics.frames.length > 0
      ) {
        const avg = metrics.frames.reduce((a, b) => a + b, 0) /
          metrics.frames.length;

        if (fpsRef.current) {
          fpsRef.current.innerText = Math.round(1000 / avg).toString();
        }
        if (frameTimeRef.current) {
          frameTimeRef.current.innerText = avg.toFixed(2);
        }

        metrics.lastUpdate = time;
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      className={'flex items-center gap-3 rounded-xl bg-grayscale-20/80 px-4 py-2 font-mono text-grayscale-80 text-xs'}
    >
      <ChartNoAxesColumn
        size={14}
        strokeWidth={2.5}
        className='text-grayscale-60'
      />
      <div className='flex gap-4'>
        <span>
          FPS: <span ref={fpsRef}>--</span>
        </span>
        <span>
          Frame: <span ref={frameTimeRef}>--</span>ms
        </span>
      </div>
    </div>
  );
}
