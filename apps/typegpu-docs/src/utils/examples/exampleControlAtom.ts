import { atom } from 'jotai';

export type ExampleControlParam<TOption extends string | number> = {
  label: string;
  options:
    | {
        initial: number;
        min?: number;
        max?: number;
        step?: number;
      }
    | {
        initial: TOption;
        options: TOption[];
      }
    | {
        initial: boolean;
      };
  onChange: (newValue: TOption | boolean) => void;
};

export const exampleControlsAtom = atom<ExampleControlParam<string | number>[]>(
  [],
);
