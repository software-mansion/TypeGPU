declare module '@wigsill/example-toolkit' {
  export type CanvasDef = {
    type: 'canvas';
    key: string;
    width?: number;
    height?: number;
    aspectRatio?: number;
  };

  export type VideoDef = {
    type: 'video';
    key: string;
    width?: number;
    height?: number;
  };

  export type TableDef = {
    type: 'table';
    key: string;
    label?: string;
  };

  export type ButtonDef = {
    type: 'button';
    key: string;
    label?: string;
    onClick?: () => void;
  };

  export type TableRef = {
    setMatrix: (data: number[][]) => void;
  };

  export type ElementDefs = {
    'canvas': CanvasDef;
    'video': VideoDef;
    'table': TableDef;
    'button': ButtonDef;
  };

  export type ElementDef = ElementDefs[keyof ElementDefs];
  export type ElementType = keyof ElementDefs;
  export type ElementOptions<T> = Omit<ElementDefs[T], 'type' | 'key'>;

  export type LayoutDef = {
    elements: ElementDef[];
  };

  type ElementResults = {
    canvas: HTMLCanvasElement;
    video: HTMLVideoElement;
    table: TableRef;
    button: HTMLButtonElement;
  };

  export type AddElement = <T extends 'canvas' | 'video' | 'table' | 'button'>(
    type: T,
    options?: ElementOptions<T>,
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
