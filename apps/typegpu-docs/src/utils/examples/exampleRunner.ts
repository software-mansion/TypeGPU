import {
  flattenControls,
  initializeControlParam,
  isFlatSection,
} from '../../examples/common/flattenControls.ts';
import type { ExampleControlParam } from './exampleControlAtom.ts';
import type { ExampleState } from './exampleState.ts';

export async function executeExample(tsImport: () => unknown): Promise<ExampleState> {
  const cleanupCallbacks: (() => unknown)[] = [];
  let disposed = false;

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const cb of cleanupCallbacks) {
      cb();
    }
  };

  const entryExampleFile = await tsImport();
  const { controls, onCleanup } = entryExampleFile as {
    controls?: Record<string, unknown> | undefined;
    onCleanup?: () => void;
  };

  const controlParams = controls ? (flattenControls(controls) as ExampleControlParam[]) : [];

  for (const param of controlParams) {
    if (!isFlatSection(param)) {
      initializeControlParam(param);
    }
  }

  if (onCleanup) {
    cleanupCallbacks.push(onCleanup);
  }

  return {
    dispose,
    controlParams,
  };
}
