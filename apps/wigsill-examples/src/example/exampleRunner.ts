import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import { GUI } from 'dat.gui';
import { filter, isNonNull, map, pipe } from 'remeda';
import { ExampleState } from './exampleState';
import { LayoutInstance } from './layout';
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

export async function executeExample(
  exampleCode: string,
  createLayout: () => LayoutInstance,
): Promise<ExampleState> {
  const cleanupCallbacks: (() => unknown)[] = [];

  const layout = createLayout();
  let disposed = false;
  cleanupCallbacks.push(() => layout.dispose());

  const gui = new GUI({ closeOnTop: true });
  cleanupCallbacks.push(() => gui.destroy());
  gui.hide();

  const dispose = () => {
    if (disposed) {
      return;
    }
    disposed = true;
    cleanupCallbacks.forEach((cb) => cb());
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
  function addParameter(
    label: string,
    options: {
      initial: string;
      options: string[];
    },
    onChange: (newValue: string) => void,
  ): void;
  function addParameter(
    label: string,
    options: {
      initial: number;
      options: number[];
    },
    onChange: (number: string) => void,
  ): void;
  function addParameter(
    label: string,
    options: {
      initial: boolean;
    },
    onChange: (newValue: boolean) => void,
  ): void;
  function addParameter(
    label: string,
    options:
      | {
          initial: number;
          min?: number;
          max?: number;
          step?: number;
        }
      | {
          initial: string;
          options: string[];
        }
      | {
          initial: number;
          options: number[];
        }
      | {
          initial: boolean;
        },
    onChange:
      | ((newValue: string) => void)
      | ((newValue: number) => void)
      | ((newValue: boolean) => void),
  ): void {
    const temp = { [label]: options.initial };

    if ('options' in options) {
      gui
        .add(temp, label, options.options)
        .onChange((value) => onChange(value as never));
    } else if (typeof options.initial === 'boolean') {
      gui
        .add(temp, label, options.initial)
        .onChange((value) => onChange(value as never));
    } else {
      gui
        .add(temp, label, options.min, options.max, options.step)
        .onChange((value) => onChange(value as never));
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
      if (moduleKey === 'wigsill') {
        return await import('wigsill');
      }
      if (moduleKey === '@wigsill/example-toolkit') {
        return {
          onCleanup(callback: () => unknown) {
            cleanupCallbacks.push(callback);
          },
          onFrame(callback: () => unknown) {
            let handle = 0;
            const runner = () => {
              callback();
              handle = requestAnimationFrame(runner);
            };
            runner();

            cleanupCallbacks.push(() => cancelAnimationFrame(handle));
          },
          addElement: layout.addElement,
          addParameter,
        };
      }
      throw new Error(`Module ${moduleKey} is not available in the sandbox.`);
    };

    const transformedCode =
      Babel.transform(exampleCode, {
        compact: false,
        retainLines: true,
        plugins: [staticToDynamicImports],
      }).code ?? exampleCode;

    const mod = Function(`
return async (_import) => {
${transformedCode}
};
`);

    // Running the code
    await mod()(_import);

    gui.show();

    return {
      dispose,
    };
  } catch (err) {
    dispose();
    throw err;
  }
}
