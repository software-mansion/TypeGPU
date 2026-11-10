import type { d } from 'typegpu';
import {
  flattenControls,
  isControlSection,
  type ControlOptions,
} from '../../examples/common/flattenControls.ts';
import type { ExampleControlParam } from './exampleControlAtom.ts';
import type { ExampleState } from './exampleState.ts';

type ControlDefinition<T> = T extends { isSection: true } ? never : Omit<T, 'label' | 'path'>;
export type ExampleControlOptions = ControlOptions<ControlDefinition<ExampleControlParam>>;

function initializeParam(param: ExampleControlParam) {
  if ('onSelectChange' in param) {
    return param.onSelectChange(param.initial);
  }
  if ('onToggleChange' in param) {
    return param.onToggleChange(param.initial);
  }
  if ('onSliderChange' in param) {
    return param.onSliderChange(param.initial);
  }
  if ('onVectorSliderChange' in param) {
    return (param.onVectorSliderChange as (v: d.v2f | d.v3f | d.v4f) => void)(param.initial);
  }
  if ('onColorChange' in param) {
    return param.onColorChange(param.initial);
  }
  if ('onTextChange' in param) {
    return param.onTextChange(param.initial);
  }
}

export async function executeExample(tsImport: () => unknown): Promise<ExampleState> {
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

  function addParameters(options: ExampleControlOptions) {
    for (const { label, path, value } of flattenControls(options)) {
      if (isControlSection(value)) {
        controlParams.push({ label, path, isSection: true });
        continue;
      }

      const param = {
        ...value,
        label,
        path,
      };

      controlParams.push(param);

      // Eager run to initialize the values.
      initializeParam(param);
    }
  }

  const entryExampleFile = await tsImport();
  const { controls, onCleanup } = entryExampleFile as {
    controls?: ExampleControlOptions | undefined;
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
