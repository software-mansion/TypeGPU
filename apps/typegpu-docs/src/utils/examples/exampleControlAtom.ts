import { atom } from 'jotai';

export type SelectControlParam = {
  onSelectChange: (newValue: string) => void;
  initial?: string;
  options: string[];
  label: string;
};

export type ToggleControlParam = {
  onToggleChange: (newValue: boolean) => void;
  initial?: boolean;
  label: string;
};

export type SliderControlParam = {
  onSliderChange: (newValue: number) => void;
  initial?: number;
  min?: number;
  max?: number;
  step?: number;
  label: string;
};

export type VectorSliderControlParam = {
  onVectorSliderChange: (newValue: number[]) => void;
  initial?: number[];
  min: number[];
  max: number[];
  step: number[];
  label: string;
};

export type ButtonControlParam = {
  onButtonClick: (() => void) | (() => Promise<void>);
  label: string;
};

export type TextAreaControlParam = {
  onTextChange: (newValue: string) => void;
  initial?: string;
  label: string;
};

export type ColorPickerControlParam = {
  onColorChange: (newValue: [number, number, number]) => void;
  initial?: [number, number, number];
  label: string;
};

export type ExampleControlParam =
  | SelectControlParam
  | ToggleControlParam
  | SliderControlParam
  | ButtonControlParam
  | TextAreaControlParam
  | VectorSliderControlParam
  | ColorPickerControlParam;

export const exampleControlsAtom = atom<ExampleControlParam[]>([]);
