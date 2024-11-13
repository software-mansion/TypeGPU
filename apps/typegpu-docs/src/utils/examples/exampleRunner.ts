import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import type { OnFrameFn } from '@typegpu/example-toolkit';
import { filter, isNonNull, map, pipe } from 'remeda';
import { wgsl } from 'typegpu/experimental';
import { transpileModule } from 'typescript';
import { tsCompilerOptions } from '../liveEditor/embeddedTypeScript';
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
            path.replaceWith(
              template.program.ast(
                `import { addParameters } from '@typegpu/example-toolkit'; 
                addParameters(${code.slice(init.start ?? 0, init.end ?? 0)});`,
              ),
            );
          }
        }
      },
    } satisfies TraverseOptions,
  };
};

const MAX_ITERATIONS = 10000;

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

type Labelless<T> = T extends unknown ? Omit<T, 'label'> : never;

export async function executeExample(
  exampleCode: string,
  tags?: string[],
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

  function addSliderPlumParameter(
    label: string,
    initial: number,
    options?: { min?: number; max?: number; step?: number },
  ) {
    let value: string | number | boolean = initial;
    const listeners = new Set<() => unknown>();

    if (disposed) {
      return;
    }

    controlParams.push({
      label,
      initial,
      min: options?.min,
      max: options?.max,
      step: options?.step,
      onSliderChange: (newValue) => {
        value = newValue;
        // Calling `listener` may cause more listeners to
        // be attached, so copying.
        for (const listener of [...listeners]) {
          listener();
        }
      },
    });

    return wgsl
      .plumFromEvent(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => value,
      )
      .$name(label);
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
      if (moduleKey === 'typegpu/experimental') {
        if (!tags?.includes('experimental')) {
          throw new Error(
            'Examples not labeled as experimental cannot import experimental modules.',
          );
        }
        return await import('typegpu/experimental');
      }
      if (moduleKey === 'typegpu/data') {
        return await import('typegpu/data');
      }
      if (moduleKey === 'typegpu/macro') {
        return await import('typegpu/macro');
      }
      if (moduleKey === '@typegpu/jit') {
        return await import('@typegpu/jit');
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
          addParameters,
          addSliderPlumParameter,
        };
      }
      throw new Error(`Module ${moduleKey} is not available in the sandbox.`);
    };

    const jsCode = tsToJs(`
      ${exampleCode}

      import { onCleanup } from '@typegpu/example-toolkit';
      onCleanup(() =>
        if (typeof device === 'object'
          && 'destroy' in device
          && typeof device.destroy === 'function'
        ) {
          device.destroy();
        }
      );
    `); // temporary solution to clean up device without using example-toolkit in the example

    const transformedCode =
      Babel.transform(jsCode, {
        compact: false,
        retainLines: true,
        plugins: [
          exportedOptionsToExampleControls,
          staticToDynamicImports,
          preventInfiniteLoops,
        ],
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
      controlParams,
    };
  } catch (err) {
    dispose();
    throw err;
  }
}
