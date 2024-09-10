declare module '@typegpu/example-toolkit' {
  export type CanvasOptions = {
    width?: number;
    height?: number;
    aspectRatio?: number;
  };

  export type VideoOptions = {
    width?: number;
    height?: number;
  };

  export type TableOptions = {
    label?: string;
  };

  export type ButtonOptions = {
    label?: string;
    onClick?: () => void;
  }

  export type TableRef = {
    setMatrix: (data: number[][]) => void;
  };

  export type ElementOptions = {
    canvas: CanvasOptions;
    video: VideoOptions;
    table: TableOptions;
    button: ButtonOptions;
  };

  export type ElementResults = {
    canvas: HTMLCanvasElement;
    video: HTMLVideoElement;
    table: TableRef;
    button: HTMLButtonElement;
  };

  export type ElementType = keyof ElementOptions;

  type ElementDefs = {
    [K in ElementType]: ElementOptions[K] & {
      type: K;
      key: string;
    };
  };

  export type ElementDef = ElementDefs[ElementType];

  export type LayoutDef = {
    elements: ElementDef[];
  };

  export type AddElement = <T extends 'canvas' | 'video' | 'table' | 'button'>(
    type: T,
    options?: ElementOptions[T],
  ) => Promise<ElementResults[T]>;

  export const addElement: AddElement;

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
    onChange?: (newValue: number) => void,
  ): TgpuPlum<number>;

  export function onCleanup(callback: () => unknown): void;

  export type OnFrameFn = (loop: (deltaTime: number) => unknown) => void;

  /**
   * `deltaTime` is time elapsed since last frame in milliseconds
   */
  export const onFrame: OnFrameFn;
}
