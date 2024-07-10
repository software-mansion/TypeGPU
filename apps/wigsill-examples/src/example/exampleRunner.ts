import { GUI } from 'dat.gui';
import * as Babel from '@babel/standalone';
import { filter, isNonNull, map, pipe } from 'remeda';
import type { TraverseOptions } from '@babel/traverse';
import type TemplateGenerator from '@babel/template';

import { ExampleState } from './exampleState';
import { LayoutInstance } from './layout';
import { ExecutionCancelledError } from './errors';
// NOTE: @babel/standalone does expose internal packages, as specified in the docs, but the
// typing for @babel/standalone does not expose them.
const template = (
  Babel as unknown as { packages: { template: typeof TemplateGenerator } }
).packages.template;

/**
 * A custom babel plugin for turning:
 *
 * `import Default, { one, two } from ''module`
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
  const gui = new GUI({ closeOnTop: true });
  gui.hide();

  function addParameter(
    label: string,
    options: {
      initial: number;
      min?: number;
      max?: number;
      step?: number;
    },
    onChange: (newValue: number) => void,
  ) {
    const temp = { [label]: options.initial };

    gui
      .add(temp, label, options.min, options.max, options.step)
      .onChange((value) => onChange(value));

    // Eager run to initialize the values.
    onChange(options.initial);
  }

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

  const transformedCode = (() => {
    const output = Babel.transform(exampleCode, {
      compact: false,
      retainLines: true,
      plugins: [staticToDynamicImports],
    });

    return output.code;
  })();

  const mod = Function(`
return async (_import) => {
${transformedCode}
};
`);

  // Running the code
  try {
    await mod()(_import);
  } catch (err) {
    if (err instanceof ExecutionCancelledError) {
      // Ignore, to be expected.
    } else {
      throw err;
    }
  }

  gui.show();

  return {
    dispose: () => {
      cleanupCallbacks.forEach((cb) => cb());
      layout.dispose();
      gui.destroy();
    },
  };
}
