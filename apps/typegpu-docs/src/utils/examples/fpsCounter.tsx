import { useEffect, useRef } from 'react';

/**
 * FPS Counter component, displays FPS and frame time in a small overlay.
 */
export function FPSCounter({
  className = 'font-mono text-xs text-grayscale-80 leading-relaxed',
}: {
  className?: string;
}) {
  const fpsRef = useRef<HTMLSpanElement>(null);
  const frameTimeRef = useRef<HTMLSpanElement>(null);
  const metricsRef = useRef({
    frames: [] as number[],
    lastTime: 0,
    lastUpdate: 0,
  });
  const avgFrameWindow = 100;

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

      if (metrics.frames.length > 60) {
        metrics.frames.shift();
      }

      if (time - metrics.lastUpdate >= avgFrameWindow && metrics.frames.length > 0) {
        const avg = metrics.frames.reduce((a, b) => a + b, 0) / metrics.frames.length;

        if (fpsRef.current) fpsRef.current.innerText = Math.round(1000 / avg).toString();
        if (frameTimeRef.current) frameTimeRef.current.innerText = avg.toFixed(2);

        metrics.lastUpdate = time;
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className={className}>
      FPS: <span ref={fpsRef}>--</span> · Frame: <span ref={frameTimeRef}>--</span> ms
    </div>
  );
}
