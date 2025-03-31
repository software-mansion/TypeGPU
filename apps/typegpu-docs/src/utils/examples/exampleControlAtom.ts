import { atom } from 'jotai';
import type * as d from 'typegpu/data';

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

export type VectorSLiderControlParam<T extends d.AnyVecInstance> = {
  onVectorSliderChange: (newValue: T) => void;
  initial?: T;
  min: T;
  max: T;
  step: T;
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

export type ExampleControlParam =
  | SelectControlParam
  | ToggleControlParam
  | SliderControlParam
  | ButtonControlParam
  | TextAreaControlParam
  | VectorSLiderControlParam<d.AnyVecInstance>;

export const exampleControlsAtom = atom<ExampleControlParam[]>([]);
