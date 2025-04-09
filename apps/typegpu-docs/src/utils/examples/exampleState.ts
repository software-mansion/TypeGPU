import type { ExampleControlParam } from './exampleControlAtom.ts';

export type ExampleState = {
  dispose: () => void;
  controlParams: ExampleControlParam[];
};
