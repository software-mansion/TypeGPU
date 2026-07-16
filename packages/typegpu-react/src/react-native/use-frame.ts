import { useEffect, useRef } from 'react';

import { useWorkletsDisabled } from '../core/root-context.tsx';
import { type FrameCtx, startFrameLoop } from '../core/use-frame.ts';
import { getWorkletsModule } from './worklets-integration.ts';

type FrameCallback = (ctx: FrameCtx) => void;
type FrameCallbackRef = { current: FrameCallback };
type UiValue<T> = {
  value: T;
  setSync(value: T | ((prev: T) => T)): void;
};

/**
 * Runs the frame loop on the UI runtime when the callback is a worklet and
 * `react-native-worklets` is available, on the RN thread otherwise
 */
export function useFrame(cb: FrameCallback) {
  const workletsDisabled = useWorkletsDisabled();
  const worklets = workletsDisabled ? null : getWorkletsModule();
  const runOnUI = worklets !== null && worklets.isWorkletFunction(cb);

  const latestCb = useRef(cb);
  const uiCbRef = useRef<UiValue<FrameCallbackRef> | undefined>(undefined);

  useEffect(() => {
    latestCb.current = cb;
    uiCbRef.current?.setSync({ current: cb });
  }, [cb]);

  useEffect(() => {
    if (!runOnUI || !worklets) {
      return startFrameLoop((ctx) => latestCb.current(ctx));
    }

    const { runOnUISync, createShareable, UIRuntimeId } = worklets;
    const cbRef = createShareable(
      UIRuntimeId,
      { current: latestCb.current },
      { initSynchronously: true },
    ) as UiValue<FrameCallbackRef>;
    const frameId = createShareable(UIRuntimeId, undefined) as UiValue<number | undefined>;
    uiCbRef.current = cbRef;

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
      uiCbRef.current = undefined;
      runOnUISync(() => {
        'worklet';
        if (frameId.value !== undefined) {
          cancelAnimationFrame(frameId.value);
        }
      });
    };
  }, [runOnUI, worklets]);
}
