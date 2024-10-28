declare module '@typegpu/example-toolkit' {
  export function addSelectParameter(
    label: string,
    initial: string,
    options: string[],
    onChange: (newValue: string) => void,
  ): void;

  export function addToggleParameter(
    label: string,
    initial: boolean,
    onChange: (newValue: boolean) => void,
  ): void;

  export function addButtonParameter(label: string, onClick: () => void): void;

  export function addSliderParameter(
    label: string,
    initial: number,
    options: {
      min?: number;
      max?: number;
      step?: number;
    },
    onChange: (newValue: number) => void,
  ): void;

  import type { TgpuPlum } from 'typegpu/experimental';

  export function addSliderPlumParameter(
    label: string,
    initial: number,
    options?: { min?: number; max?: number; step?: number },
  ): TgpuPlum<number>;

  export function onCleanup(callback: () => unknown): void;

  export type OnFrameFn = (loop: (deltaTime: number) => unknown) => void;

  /**
   * `deltaTime` is time elapsed since last frame in milliseconds
   */
  export const onFrame: OnFrameFn;
}
