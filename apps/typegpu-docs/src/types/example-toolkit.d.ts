declare module '@typegpu/example-toolkit' {
  import type { TgpuPlum } from 'typegpu/experimental';

  export function addSliderPlumParameter(
    label: string,
    initial: number,
    options?: { min?: number; max?: number; step?: number },
  ): TgpuPlum<number>;

  export type OnFrameFn = (loop: (deltaTime: number) => unknown) => void;

  /**
   * `deltaTime` is time elapsed since last frame in milliseconds
   */
  export const onFrame: OnFrameFn;
}
