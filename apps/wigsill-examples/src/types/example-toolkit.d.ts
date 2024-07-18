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

  export type ElementDef = CanvasDef | VideoDef;

  export type ElementType = ElementDef['type'];
  export type ElementOptions = Omit<ElementDef, 'type' | 'key'>;

  export type LayoutDef = {
    elements: ElementDef[];
  };

  type ElementResults = {
    canvas: HTMLCanvasElement;
    video: HTMLVideoElement;
  };

  export type AddElement = <T extends 'canvas' | 'video'>(
    type: T,
    options?: ElementOptions,
  ) => Promise<ElementResults[T]>;

  export const addElement: AddElement;

  function addParameter(
    label: string,
    options: {
      initial: number;
      min?: number;
      max?: number;
      step?: number;
    },
    onChange: (newValue: number) => void,
  ): void;
  function addParameter<TOption extends string | number>(
    label: string,
    options: {
      initial: TOption;
      options: TOption[];
    },
    onChange: (newValue: TOption) => void,
  ): void;
  function addParameter(
    label: string,
    options: {
      initial: boolean;
    },
    onChange: (newValue: boolean) => void,
  ): void;

  export function onCleanup(callback: () => unknown): void;
  export function onFrame(callback: () => unknown): void;
}
