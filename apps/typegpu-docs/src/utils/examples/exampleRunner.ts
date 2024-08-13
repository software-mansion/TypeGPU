import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import type { AddSliderParam, OnFrameFn } from '@typegpu/example-toolkit';
import type { SetStateAction } from 'jotai';
import { filter, isNonNull, map, pipe } from 'remeda';
import { wgsl } from 'typegpu';
import { transpileModule } from 'typescript';
import { tsCompilerOptions } from '../liveEditor/embeddedTypeScript';
import type { ExampleControlParam } from './exampleControlAtom';
import type { ExampleState } from './exampleState';
import type { LayoutInstance } from './layout';

// NOTE: @babel/standalone does expose internal packages, as specified in the docs, but the
// typing for @babel/standalone does not expose them.
const template = (
  Babel as unknown as { packages: { template: typeof TemplateGenerator } }
).packages.template;

const createSliderParam = (
  setExampleControlParams: (
    _: SetStateAction<ExampleControlParam<string | number>[]>,
  ) => void,
  label: string,
  initial: number,
  opts?: { min?: number; max?: number; step?: number },
) => {
  const { min, max, step } = opts ?? {};

  const temp = {
    [label]: initial,
  };

  let value: string | number | boolean = initial;
  const listeners = new Set<() => unknown>();

  setExampleControlParams((params) => [
    ...params,
    {
      label: label,
      options: {
        min,
        max,
        step,
        initial,
      },
      onChange: (newValue) => {
        value = newValue;
        // Calling `listener` may cause more listeners to
        // be attached, so copying.
        for (const listener of [...listeners]) {
          listener();
        }
      },
    },
  ]);

  return wgsl
    .plumFromEvent(
      (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      () => value,
    )
    .$name(label);
};

/**
 * A custom babel plugin for turning:
 *
 * `import Default, { one, two } from 'module'`
 *  into
 * `const { default: Default, one, two } = await _import('module')`
 */
const staticToDynamicImports = {
  visitor: {
    ImportDeclaration(path) {
      const moduleName = path.node.source.value;

      const imports = pipe(
        path.node.specifiers,
        map((imp) => {
          if (imp.type === 'ImportDefaultSpecifier') {
            return ['default', imp.local.name] as const;
          }

          if (imp.type === 'ImportSpecifier') {
            return [
              imp.imported.type === 'Identifier'
                ? imp.imported.name
                : imp.imported.value,
              imp.local.name,
            ] as const;
          }

          // Ignoring namespace imports
          return null;
        }),
        filter(isNonNull),
      );

      path.replaceWith(
        template.statement.ast(
          `const { ${imports.map((imp) => (imp[0] === imp[1] ? imp[0] : `${imp[0]}: ${imp[1]}`)).join(',')} } = await _import('${moduleName}');`,
        ),
      );
    },
  } satisfies TraverseOptions,
};

const MAX_ITERATIONS = 2000;

/**
 * from https://github.com/facebook/react/blob/d906de7f602df810c38aa622c83023228b047db6/scripts/babel/transform-prevent-infinite-loops.js
 */
// biome-ignore lint/suspicious/noExplicitAny:
const preventInfiniteLoops = ({ types: t, template }: any) => {
  const buildGuard = template(`
    if (ITERATOR++ > MAX_ITERATIONS) {
      throw new RangeError(
        'Potential infinite loop: exceeded ' +
        MAX_ITERATIONS +
        ' iterations.'
      );
    }
  `);

  return {
    visitor: {
      // biome-ignore lint/suspicious/noExplicitAny:
      'WhileStatement|ForStatement|DoWhileStatement': (path: any) => {
        const iterator = path.scope.parent.generateUidIdentifier('loopIt');
        const iteratorInit = t.numericLiteral(0);
        path.scope.parent.push({
          id: iterator,
          init: iteratorInit,
        });
        const guard = buildGuard({
          ITERATOR: iterator,
          MAX_ITERATIONS: t.numericLiteral(MAX_ITERATIONS),
        });

        if (!path.get('body').isBlockStatement()) {
          const statement = path.get('body').node;
          path.get('body').replaceWith(t.blockStatement([guard, statement]));
        } else {
          path.get('body').unshiftContainer('body', guard);
        }
      },
    },
  };
};

function tsToJs(code: string): string {
  return transpileModule(code, {
    compilerOptions: tsCompilerOptions,
  }).outputText;
}

export async function executeExample(
  exampleCode: string,
  createLayout: () => LayoutInstance,
  setExampleControlParams: (
    _: SetStateAction<ExampleControlParam<string | number>[]>,
  ) => void,
): Promise<ExampleState> {
  const cleanupCallbacks: (() => unknown)[] = [];

  const layout = createLayout();
  let disposed = false;
  cleanupCallbacks.push(() => layout.dispose());

  setExampleControlParams([]);

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    for (const cb of cleanupCallbacks) {
      cb();
    }
  };

  function addParameter(
    label: string,
    options: {
      initial: number;
      min?: number;
      max?: number;
      step?: number;
    },
    onChange: (newValue: number) => void,
  ): void;
  function addParameter<TOption extends string | number>(
    label: string,
    options: {
      initial: TOption;
      options: TOption[];
    },
    onChange: (newValue: TOption) => void,
  ): void;
  function addParameter(
    label: string,
    options: {
      initial: boolean;
    },
    onChange: (newValue: boolean) => void,
  ): void;
  function addParameter<TOption extends string | number>(
    label: string,
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
        },
    onChange: (newValue: TOption | boolean) => void,
  ): void {
    if ('options' in options) {
      setExampleControlParams((controls) => [
        ...controls,
        {
          label,
          options: options,
          onChange: (value) => onChange(value as never),
        },
      ]);
    } else if ('min' in options || 'max' in options || 'step' in options) {
      setExampleControlParams((controls) => [
        ...controls,
        {
          label,
          options: options,
          onChange: (value) => onChange(value as never),
        },
      ]);
    } else {
      setExampleControlParams((controls) => [
        ...controls,
        {
          label,
          options: options,
          onChange: (value) => onChange(value as never),
        },
      ]);
    }

    // Eager run to initialize the values.
    onChange(options.initial as never);
  }

  try {
    /**
     * Simulated imports from within the sandbox, making only a subset of
     * modules available.
     */
    const _import = async (moduleKey: string) => {
      if (moduleKey === 'typegpu') {
        return await import('typegpu');
      }
      if (moduleKey === 'typegpu/data') {
        return await import('typegpu/data');
      }
      if (moduleKey === 'typegpu/macro') {
        return await import('typegpu/macro');
      }
      if (moduleKey === '@typegpu/example-toolkit') {
        return {
          onCleanup(callback: () => unknown) {
            cleanupCallbacks.push(callback);
          },
          onFrame: ((loop: (deltaTime: number) => unknown) => {
            let lastTime = Date.now();

            let handle = 0;
            const runner = () => {
              const now = Date.now();
              const dt = now - lastTime;
              lastTime = now;
              loop(dt);

              handle = requestAnimationFrame(runner);
            };
            handle = requestAnimationFrame(runner);

            cleanupCallbacks.push(() => cancelAnimationFrame(handle));
          }) satisfies OnFrameFn,
          addElement: layout.addElement,
          addParameter,
          addSliderParam: ((label, initial, opts) => {
            return createSliderParam(
              setExampleControlParams,
              label,
              initial,
              opts,
            );
          }) as AddSliderParam,
        };
      }
      throw new Error(`Module ${moduleKey} is not available in the sandbox.`);
    };

    const jsCode = tsToJs(exampleCode);

    const transformedCode =
      Babel.transform(jsCode, {
        compact: false,
        retainLines: true,
        plugins: [staticToDynamicImports, preventInfiniteLoops],
      }).code ?? jsCode;

    const mod = Function(`
return async (_import) => {
${transformedCode}
};
`);

    // Running the code
    await mod()(_import);

    return {
      dispose,
    };
  } catch (err) {
    dispose();
    throw err;
  }
}
