// TODO: delete this file after merging textures
declare module '@typegpu/example-toolkit' {
  import type { TgpuPlum } from 'typegpu/experimental';

  export function addSliderPlumParameter(
    label: string,
    initial: number,
    options?: { min?: number; max?: number; step?: number },
  ): TgpuPlum<number>;
}
