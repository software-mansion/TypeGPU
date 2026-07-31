import type { d } from 'typegpu';

type SelectControlParam<T extends readonly string[] | readonly number[]> = {
  initial: NoInfer<T[number]>;
  options: T;
  onSelectChange: (newValue: NoInfer<T[number]>) => void;
};

type ToggleControlParam = {
  initial: boolean;
  onToggleChange: (newValue: boolean) => void;
};

type SliderControlParam = {
  initial: number;
  min?: number;
  max?: number;
  step?: number;
  onSliderChange: (newValue: number) => void;
};

type VectorSliderControlParam<T extends d.v2f | d.v3f | d.v4f> = {
  initial: T;
  min: T;
  max: T;
  step: T;
  onVectorSliderChange: (newValue: T) => void;
};

type ColorPickerControlParam = {
  initial: d.v3f;
  onColorChange: (newValue: d.v3f) => void;
};

type ButtonControlParam = {
  onButtonClick: (() => void) | (() => Promise<void>);
};

type TextAreaControlParam = {
  initial: string;
  onTextChange: (newValue: string) => void;
};

type ControlField<T> =
  | false // short-circuit controls
  | SelectControlParam<
      T extends readonly string[] | readonly number[] ? T : T extends string[] ? string[] : number[]
    >
  | ToggleControlParam
  | SliderControlParam
  | VectorSliderControlParam<T extends d.v2f | d.v3f | d.v4f ? T : never>
  | ColorPickerControlParam
  | ButtonControlParam
  | TextAreaControlParam;

export type ControlSection<T extends Record<string, unknown> = Record<string, unknown>> = {
  isSection: true;
  controls: T;
};

export function section<const T extends Record<string, unknown>>(controls: {
  [Key in keyof T]: ControlField<T[Key]>;
}): ControlSection<T> {
  return {
    isSection: true,
    controls: controls as T,
  };
}

export function defineControls<const T extends Record<string, unknown>>(controls: {
  [Key in keyof T]: ControlField<T[Key]> | ControlSection;
}) {
  return controls;
}
