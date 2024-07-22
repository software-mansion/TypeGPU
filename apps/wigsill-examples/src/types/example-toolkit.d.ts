declare module '@wigsill/example-toolkit' {
  export type CanvasDef = {
    type: 'canvas';
    key: string;
    width?: number;
    height?: number;
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

  export type TableRef = {
    setMatrix: (data: number[][]) => void;
  };

  export type ElementDef = CanvasDef | VideoDef | TableDef ;

  export type ElementType = ElementDef['type'];
  export type ElementOptions = Omit<ElementDef, 'type' | 'key'>;

  export type LayoutDef = {
    elements: ElementDef[];
  };

  type ElementResults = {
    canvas: HTMLCanvasElement;
    video: HTMLVideoElement;
    table: TableRef;
  };

  export type AddElement = <T extends 'canvas' | 'video' | 'table'>(
    type: T,
    options?: ElementOptions,
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
