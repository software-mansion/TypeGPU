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
import type { LayoutInstance } from './layout';

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

let addButtonParameterImportAdded = false;

const labeledFunctionToControlButtons = () => {
  return {
    visitor: {
      ImportDeclaration(path) {
        if (path.node.source.value === '@typegpu/example-toolkit') {
          for (const imp of path.node.specifiers) {
            if (imp.local.name === 'addButtonParameter') {
              addButtonParameterImportAdded = true;
              break;
            }
          }
        }
      },

      ExportNamedDeclaration(path, state) {
        // @ts-ignore
        const code: string = state.file.code;
        const declaration = path.node.declaration;
        if (declaration?.type === 'FunctionDeclaration') {
          for (const comment of path.node.leadingComments ?? []) {
            const regExp = /.*@button.*\"(?<label>.*)\".*/;
            const label = regExp.exec(comment.value)?.groups?.label;

            if (label) {
              path.replaceWith(
                template.program.ast(
                  `${addButtonParameterImportAdded ? '' : "import { addButtonParameter } from '@typegpu/example-toolkit';"} addButtonParameter('${label}', ${code.slice(declaration.start ?? 0, declaration.end ?? 0)})`,
                ),
              );
              addButtonParameterImportAdded = true;
            }
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

export async function executeExample(
  exampleCode: string,
  createLayout: () => LayoutInstance,
): Promise<ExampleState> {
  const cleanupCallbacks: (() => unknown)[] = [];

  const layout = createLayout();
  let disposed = false;
  cleanupCallbacks.push(() => layout.dispose());

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

  function addSelectParameter(
    label: string,
    initial: string,
    options: string[],
    onChange: (newValue: string) => void,
  ) {
    if (disposed) {
      return;
    }

    controlParams.push({
      type: 'select',
      label,
      initial,
      options,
      onChange,
    });

    // Eager run to initialize the values.
    onChange(initial);
  }

  function addToggleParameter(
    label: string,
    initial: boolean,
    onChange: (newValue: boolean) => void,
  ) {
    if (disposed) {
      return;
    }

    controlParams.push({
      type: 'toggle',
      label,
      initial,
      onChange,
    });

    // Eager run to initialize the values.
    onChange(initial);
  }

  function addSliderParameter(
    label: string,
    initial: number,
    options: {
      min?: number;
      max?: number;
      step?: number;
    },
    onChange: (newValue: number) => void,
  ) {
    if (disposed) {
      return;
    }

    controlParams.push({
      type: 'slider',
      initial,
      label,
      options,
      onChange,
    });

    // Eager run to initialize the values.
    onChange(initial);
  }

  function addButtonParameter(label: string, onClick: () => void) {
    if (disposed) {
      return;
    }

    controlParams.push({
      type: 'button',
      label,
      onClick,
    });
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
      type: 'slider',
      label,
      initial,
      options: options ?? {},
      onChange: (newValue) => {
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
        return await import('typegpu/experimental');
      }
      if (moduleKey === 'typegpu/experimental') {
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
          addElement: layout.addElement,
          addSelectParameter,
          addSliderParameter,
          addButtonParameter,
          addToggleParameter,
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

    addButtonParameterImportAdded = false;
    const transformedCode =
      Babel.transform(jsCode, {
        compact: false,
        retainLines: true,
        plugins: [
          labeledFunctionToControlButtons,
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
