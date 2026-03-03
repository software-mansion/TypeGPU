import { useEffect, useRef } from 'react';

interface FrameCtx {
  readonly deltaSeconds: number;
}

export function useFrame(cb: (ctx: FrameCtx) => void) {
  const latestCb = useRef(cb);

  useEffect(() => {
    latestCb.current = cb;
  }, [cb]);

  useEffect(() => {
    let frameId: number | undefined;
    let lastTime: number | undefined;

    const loop = () => {
      frameId = requestAnimationFrame(loop);

      const now = performance.now();
      if (lastTime === undefined) {
        lastTime = now;
      }
      latestCb.current({ deltaSeconds: (now - lastTime) / 1000 });
      lastTime = now;
    };

    loop();

    return () => {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
    };
  }, []);
}
