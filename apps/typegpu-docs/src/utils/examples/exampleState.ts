import type { ExampleControlParam } from './exampleControlAtom';

export type ExampleState = {
  dispose: () => void;
  controlParams: ExampleControlParam[];
};
