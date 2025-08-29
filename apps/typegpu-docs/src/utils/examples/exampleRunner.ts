import type { ExampleControlParam } from './exampleControlAtom.ts';
import type { ExampleState } from './exampleState.ts';

type Labelless<T> = T extends unknown ? Omit<T, 'label'> : never;

export async function executeExample(
  tsImport: () => unknown,
): Promise<ExampleState> {
  const cleanupCallbacks: (() => unknown)[] = [];
  let disposed = false;
  const controlParams: ExampleControlParam[] = [];

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const cb of cleanupCallbacks) {
      cb();
    }
  };

  function addParameters(
    options: Record<string, Labelless<ExampleControlParam>>,
  ) {
    for (const [label, value] of Object.entries(options)) {
      const param = {
        ...value,
        label,
      };

      controlParams.push(param);

      // Eager run to initialize the values.
      initializeParam(param);
    }
  }

  function initializeParam(param: ExampleControlParam) {
    if ('onSelectChange' in param) {
      return param.onSelectChange(param.initial ?? param.options[0]);
    }
    if ('onToggleChange' in param) {
      return param.onToggleChange(param.initial ?? false);
    }
    if ('onSliderChange' in param) {
      return param.onSliderChange(param.initial ?? param.min ?? 0);
    }
    if ('onVectorSliderChange' in param) {
      return param.onVectorSliderChange(param.initial ?? [0, 0, 0]);
    }
    if ('onColorChange' in param) {
      return param.onColorChange(param.initial ?? [0, 0, 0]);
    }
    if ('onTextChange' in param) {
      return param.onTextChange(param.initial ?? '');
    }
  }

  const entryExampleFile = await tsImport();
  const { controls, onCleanup } = entryExampleFile as {
    controls?: Record<string, Labelless<ExampleControlParam>> | undefined;
    onCleanup?: () => void;
  };

  if (controls) {
    addParameters(controls);
  }
  if (onCleanup) {
    cleanupCallbacks.push(onCleanup);
  }

  return {
    dispose,
    controlParams,
  };
}
