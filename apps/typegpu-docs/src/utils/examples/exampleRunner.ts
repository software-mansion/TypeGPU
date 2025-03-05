import type { ExampleControlParam } from './exampleControlAtom';
import type { ExampleState } from './exampleState';

type Labelless<T> = T extends unknown ? Omit<T, 'label'> : never;

export async function executeExample(
  exampleCode: Record<string, string>,
  exampleSources: Record<string, () => void>,
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
  }

  function myExtractUrlFromViteImport(importFn: () => void): string | undefined  {
    const filePath = String(importFn);
    const match = filePath.match(/\(\)\s*=>\s*import\("([^"]+)"\)/);
    if (match?.[1]) {
      console.log(match[1])
      return match[1];
    }
  }
  
  function noCacheImport(importFn: () => void): Promise<Record<string, unknown>> {
    const url = `${myExtractUrlFromViteImport(importFn)}&update=${Date.now()}`;
  
    // @vite-ignore
    console.log('ja[oeroole', typeof(import(url)));
    return import(url);
  }
  
  const entryExampleFile = await noCacheImport(exampleSources['index.ts']);
  const { controls, onCleanup } = entryExampleFile as { controls?: Record<string, Labelless<ExampleControlParam>> | undefined, onCleanup?: () => void };

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
