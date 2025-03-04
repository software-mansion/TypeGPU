import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import type { ExampleControlParam } from './exampleControlAtom';
import type { ExampleState } from './exampleState';

// NOTE: @babel/standalone does expose internal packages, as specified in the docs, but the
// typing for @babel/standalone does not expose them.
const template = (
  Babel as unknown as { packages: { template: typeof TemplateGenerator } }
).packages.template;

/**
 * A custom babel plugin for turning:
 *
 * `import Default, { one, two } from 'module'`
 *  into
 * `const { default: Default, one, two } = await _import('module')`
 */
const exportedOptionsToExampleControls = () => {
  return {
    visitor: {
      ExportNamedDeclaration(path, state) {
        // @ts-ignore
        const code: string = state.file.code;
        const declaration = path.node.declaration;

        if (declaration?.type === 'VariableDeclaration') {
          const init = declaration.declarations[0].init;

          if (init) {
            path.replaceWithMultiple([
              template.statement`import { addParameters } from '@typegpu/example-toolkit'`(),
              template.statement`addParameters(${code.slice(init.start ?? 0, init.end ?? 0)});`(),
            ]);
          }
        }

        if (declaration?.type === 'FunctionDeclaration') {
          const body = declaration.body;
          path.replaceWithMultiple([
            template.statement`import { onCleanup } from '@typegpu/example-toolkit'`(),
            template.statement`onCleanup(() => ${code.slice(body.start ?? 0, body.end ?? 0)});`(),
          ]);
        }
      },
    } satisfies TraverseOptions,
  };
};

type Labelless<T> = T extends unknown ? Omit<T, 'label'> : never;

export async function executeExample(
  exampleCode: Record<string, string>,
  exampleSources: Record<string, string>,
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

  const entryExampleFile = await import(`${exampleSources['index.ts']}?t=${Date.now()}`);


  return {
    dispose,
    controlParams,
  };
}
