import { useEffect, useRef } from 'react';

export interface FrameCtx {
  /**
   * Time elapsed since the last frame
   */
  readonly deltaSeconds: number;
  /**
   * Time elapsed since the mounting of this hook
   */
  readonly elapsedSeconds: number;
}

export function startFrameLoop(cb: (ctx: FrameCtx) => void): () => void {
  let frameId: number | undefined;
  let startTime: number | undefined;
  let lastTime: number | undefined;

  const loop = () => {
    frameId = requestAnimationFrame(loop);

    const now = performance.now();
    if (lastTime === undefined || startTime === undefined) {
      startTime = now;
      lastTime = now;
    }
    cb({
      deltaSeconds: (now - lastTime) / 1000,
      elapsedSeconds: (now - startTime) / 1000,
    });
    lastTime = now;
  };

  loop();

  return () => {
    if (frameId !== undefined) {
      cancelAnimationFrame(frameId);
    }
  };
}

export function useFrame(cb: (ctx: FrameCtx) => void) {
  const latestCb = useRef(cb);

  useEffect(() => {
    latestCb.current = cb;
  }, [cb]);

  useEffect(() => startFrameLoop((ctx) => latestCb.current(ctx)), []);
}
