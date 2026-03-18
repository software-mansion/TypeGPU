import { atom } from 'jotai';
import type { d } from 'typegpu';

export type SelectControlParam = {
  onSelectChange: (newValue: string) => void;
  initial: string;
  options: string[];
  label: string;
};

export type ToggleControlParam = {
  onToggleChange: (newValue: boolean) => void;
  initial: boolean;
  label: string;
};

export type SliderControlParam = {
  onSliderChange: (newValue: number) => void;
  initial: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
};

export type VectorSliderControlParam<T extends d.v2f | d.v3f | d.v4f> = {
  onVectorSliderChange: (newValue: T) => void;
  initial: T;
  min: T;
  max: T;
  step: T;
  label: string;
};

export type ColorPickerControlParam = {
  onColorChange: (newValue: d.v3f) => void;
  initial: d.v3f;
  label: string;
};

export type ButtonControlParam = {
  onButtonClick: (() => void) | (() => Promise<void>);
  label: string;
};

export type TextAreaControlParam = {
  onTextChange: (newValue: string) => void;
  initial: string;
  label: string;
};

export type ExampleControlParam =
  | SelectControlParam
  | ToggleControlParam
  | SliderControlParam
  | ButtonControlParam
  | TextAreaControlParam
  | VectorSliderControlParam<d.v2f>
  | VectorSliderControlParam<d.v3f>
  | VectorSliderControlParam<d.v4f>
  | ColorPickerControlParam;

export const exampleControlsAtom = atom<ExampleControlParam[]>([]);
