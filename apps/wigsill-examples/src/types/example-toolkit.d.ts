declare module '@wigsill/example-toolkit' {
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

  type Merge<A, B> = {
    [K in keyof A]: K extends keyof B ? B[K] : A[K];
  } & B extends infer O
    ? { [K in keyof O]: O[K] }
    : never;
  
  type ElementDefs = {
    [K in ElementType]: Merge<
      ElementOptions[K],
      {
        type: K;
        key: string;
      }
    >;
  };

  export type TableRef = {
    setMatrix: (data: number[][]) => void;
  };

  export type ElementDef = ElementDefs[keyof ElementDefs];
  export type ElementType = keyof ElementDefs;
  export type ElementOptions<T> = Omit<ElementDefs[T], 'type' | 'key'>;

  export type LayoutDef = {
    elements: ElementDef[];
  };

  export type AddElement = <T extends 'canvas' | 'video' | 'table' | 'button'>(
    type: T,
    options?: ElementOptions[T],
  ) => Promise<ElementResults[T]>;

  export const addElement: AddElement;

  export function addParameter(
    label: string,
    options: {
      initial: number;
      min?: number;
      max?: number;
      step?: number;
    },
    onChange: (newValue: number) => void,
  ): void;
  export function addParameter<TOption extends string | number>(
    label: string,
    options: {
      initial: TOption;
      options: TOption[];
    },
    onChange: (newValue: TOption) => void,
  ): void;
  export function addParameter(
    label: string,
    options: {
      initial: boolean;
    },
    onChange: (newValue: boolean) => void,
  ): void;

  export function onCleanup(callback: () => unknown): void;

  export type OnFrameFn = (loop: (deltaTime: number) => unknown) => void;

  /**
   * `deltaTime` is time elapsed since last frame in milliseconds
   */
  export const onFrame: OnFrameFn;
}
