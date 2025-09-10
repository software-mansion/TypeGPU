import { useEffect, useRef } from 'react';

export function useFrame(cb: () => void) {
  const latestCb = useRef(cb);

  useEffect(() => {
    latestCb.current = cb;
  }, [cb]);

  useEffect(() => {
    let frameId: number | undefined;

    const loop = () => {
      frameId = requestAnimationFrame(loop);
      latestCb.current();
    };

    loop();

    return () => {
      if (frameId !== undefined) {
        cancelAnimationFrame(frameId);
      }
    };
  }, []);
}
