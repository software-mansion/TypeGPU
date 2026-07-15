import { useEffect, useRef } from 'react';
import { runOnUISync, createShareable, UIRuntimeId } from 'react-native-worklets';

interface FrameCtx {
  readonly deltaSeconds: number;
  readonly elapsedSeconds: number;
}

type FrameCallback = (ctx: FrameCtx) => void;
type FrameCallbackRef = { current: FrameCallback };
type UiValue<T> = {
  value: T;
  setSync(value: T | ((prev: T) => T)): void;
};

export function useFrame(cb: FrameCallback) {
  const latestCb = useRef<UiValue<FrameCallbackRef> | undefined>(undefined);

  useEffect(() => {
    const cbRef = createShareable(
      UIRuntimeId,
      { current: cb },
      { initSynchronously: true },
    ) as UiValue<FrameCallbackRef>;
    const frameId = createShareable(UIRuntimeId, undefined) as UiValue<number | undefined>;
    latestCb.current = cbRef;

    runOnUISync(() => {
      'worklet';
      let startTime: number | undefined;
      let lastTime: number | undefined;

      function loop(timestamp?: number) {
        frameId.value = requestAnimationFrame(loop);

        const now = timestamp ?? performance.now();
        if (lastTime === undefined || startTime === undefined) {
          startTime = now;
          lastTime = now;
        }
        cbRef.value.current({
          deltaSeconds: (now - lastTime) / 1000,
          elapsedSeconds: (now - startTime) / 1000,
        });
        lastTime = now;
      }

      loop();
    });

    return () => {
      latestCb.current = undefined;
      runOnUISync(() => {
        'worklet';
        if (frameId.value !== undefined) {
          cancelAnimationFrame(frameId.value);
        }
      });
    };
  }, []);

  useEffect(() => {
    latestCb.current?.setSync({ current: cb });
  }, [cb]);
}
