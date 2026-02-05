type SelectControlParam<T> = {
  initial?: T;
  options: readonly T[];
  onSelectChange: (newValue: T) => void;
};

type ToggleControlParam = {
  initial?: boolean;
  onToggleChange: (newValue: boolean) => void;
};

type SliderControlParam = {
  initial?: number;
  min?: number;
  max?: number;
  step?: number;
  onSliderChange: (newValue: number) => void;
};

type VectorSliderControlParam = {
  initial?: number[];
  min: number[];
  max: number[];
  step: number[];
  onVectorSliderChange: (newValue: number[]) => void;
};

type ColorPickerControlParam = {
  initial?: readonly number[];
  onColorChange: (newValue: readonly [number, number, number]) => void;
};

type ButtonControlParam = {
  onButtonClick: (() => void) | (() => Promise<void>);
};

type TextAreaControlParam = {
  initial?: string;
  onTextChange: (newValue: string) => void;
};

export function defineControls<
  T extends Record<string, unknown>,
>(
  controls: {
    [Key in keyof T]:
      | false // short-circuit controls
      | SelectControlParam<T[Key]>
      | ToggleControlParam
      | SliderControlParam
      | VectorSliderControlParam
      | ColorPickerControlParam
      | ButtonControlParam
      | TextAreaControlParam;
  },
) {
  return controls;
}
