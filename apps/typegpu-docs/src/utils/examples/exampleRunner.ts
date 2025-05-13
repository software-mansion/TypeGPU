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

  function extractUrlFromViteImport(
    importFn: () => void,
  ): [URL | undefined, boolean] {
    const filePath = String(importFn);
    const match = filePath.match(/\(\)\s*=>\s*import\("([^"]+)"\)/);

    if (match?.[1]) {
      const isRelative = match[1].startsWith('./');
      return [new URL(match[1], window.location.origin), isRelative];
    }

    return [undefined, false];
  }

  function noCacheImport(
    importFn: () => void,
  ): Promise<Record<string, unknown>> {
    const [url, isRelative] = extractUrlFromViteImport(importFn);

    if (!url) {
      throw new Error(`Could not no-cache-import using ${importFn}`);
    }

    url.searchParams.append('update', Date.now().toString());
    return import(
      /* @vite-ignore */ `${isRelative ? '.' : ''}${url.pathname}${url.search}`
    );
  }

  const entryExampleFile = await noCacheImport(tsImport);
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
