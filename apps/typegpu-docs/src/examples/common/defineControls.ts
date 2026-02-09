import type { d } from 'typegpu';

type SelectControlParam<T> = {
  initial: T;
  options: readonly T[];
  onSelectChange: (newValue: T) => void;
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

export function defineControls<const T extends Record<string, unknown>>(
  controls: {
    [Key in keyof T]:
      | false // short-circuit controls
      | SelectControlParam<T[Key]>
      | ToggleControlParam
      | SliderControlParam
      | VectorSliderControlParam<
        T[Key] extends d.v2f | d.v3f | d.v4f ? T[Key] : never
      >
      | ColorPickerControlParam
      | ButtonControlParam
      | TextAreaControlParam;
  },
) {
  return controls;
}
