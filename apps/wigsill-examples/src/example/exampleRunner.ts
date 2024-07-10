import * as Babel from '@babel/standalone';
import { filter, isNonNull, map, pipe } from 'remeda';
import type { TraverseOptions } from '@babel/traverse';
import type TemplateGenerator from '@babel/template';

import { ExampleState } from './exampleState';

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
  defineLayout: () => void,
): Promise<ExampleState> {
  const cleanupCallbacks: (() => unknown)[] = [];

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

    console.log(output.code);

    return output.code;
  })();

  const mod = Function(`
return async (_import) => {
${transformedCode}
};
`);

  const result: Promise<string> = mod()(_import);

  console.log(await result);

  return {
    dispose: () => {
      cleanupCallbacks.forEach((cb) => cb());
    },
  };
}
