import type { d } from 'typegpu';

export type SelectControlParam<
  T extends readonly string[] | readonly number[] = readonly string[] | readonly number[],
> = {
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

type ControlFields<T> = { [Key in keyof T]: ControlField<T[Key]> };

export type ControlSection<T extends Record<string, unknown> = Record<string, unknown>> = {
  isSection: true;
  controls: T;
};

type RootControlFields<Args> = {
  [Key in keyof Args]:
    | ControlField<Args[Key]>
    | ControlSection<ControlFields<Args[Key]> & Record<string, object | false>>;
};

// Inferring the descriptor captures even misspelled keys. Check them against each control kind.
type OnlyKnownKeys<Descriptor, Shape> = Shape extends unknown
  ? { [Key in keyof Descriptor]: Key extends keyof Shape ? unknown : never }
  : never;

type CheckControlKeys<Descriptor> =
  Descriptor extends ControlSection<infer Children>
    ? OnlyKnownKeys<Descriptor, ControlSection> & { controls: CheckControlMap<Children> }
    : OnlyKnownKeys<Descriptor, ControlField<unknown>>;

type CheckControlMap<T> = { [Key in keyof T]: CheckControlKeys<T[Key]> };

// Args supplies callback argument types. Controls preserves the exact descriptors for consumers.
export function section<
  const Args extends Record<string, unknown>,
  const Controls extends Record<string, unknown>,
>(
  controls: Controls & ControlFields<Args> & CheckControlMap<NoInfer<Controls>>,
): ControlSection<Controls>;
export function section<const Args extends Record<string, unknown>>(
  controls: ControlFields<Args>,
): ControlSection<ControlFields<Args>>;
export function section(controls: Record<string, unknown>) {
  return { isSection: true as const, controls };
}

export function defineControls<
  const Args extends Record<string, unknown>,
  const Controls extends Record<string, unknown>,
>(
  controls: Controls & RootControlFields<Args> & CheckControlMap<NoInfer<Controls>>,
): NoInfer<Controls>;
export function defineControls<const Args extends Record<string, unknown>>(
  controls: RootControlFields<Args>,
): RootControlFields<Args>;
export function defineControls(controls: Record<string, unknown>) {
  return controls;
}
