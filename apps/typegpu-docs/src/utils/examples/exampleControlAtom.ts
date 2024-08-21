import { atom } from 'jotai';

export type SelectControlParam = {
  type: 'select';
  initial: string;
  options: string[];
  onChange: (newValue: string) => void;
  label: string;
};

export type ToggleControlParam = {
  type: 'toggle';
  initial: boolean;
  onChange: (newValue: boolean) => void;
  label: string;
};

export type SliderControlParam = {
  type: 'slider';
  initial: number;
  options: {
    min?: number;
    max?: number;
    step?: number;
  };
  onChange: (newValue: number) => void;
  label: string;
};

export type ButtonControlParam = {
  type: 'button';
  onClick: () => void;
  label: string;
};

export type ExampleControlParam =
  | SelectControlParam
  | ToggleControlParam
  | SliderControlParam
  | ButtonControlParam;

export const exampleControlsAtom = atom<ExampleControlParam[]>([]);
