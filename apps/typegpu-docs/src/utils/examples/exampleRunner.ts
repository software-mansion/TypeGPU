import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import { filter, groupBy, isNonNull, map, pipe } from 'remeda';
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

          if (imp.type === 'ImportNamespaceSpecifier') {
            return ['*', imp.local.name] as const;
          }

          if (imp.type === 'ImportSpecifier') {
            return [
              imp.imported.type === 'Identifier'
                ? imp.imported.name
                : imp.imported.value,
              imp.local.name,
            ] as const;
          }

          return null;
        }),
        filter(isNonNull),
        groupBy((imp) => (imp[0] === '*' ? 'wildCard' : 'nonWildCard')),
      );

      const wildCard = imports.wildCard;
      const nonWildCard = imports.nonWildCard;

      path.replaceWithMultiple(
        [
          wildCard?.length
            ? [
                template.statement`const ${wildCard[0][1]} = await _import('${moduleName}');`(),
              ]
            : [],
          nonWildCard?.length
            ? [
                template.statement`const { ${nonWildCard.map((imp) => (imp[0] === imp[1] ? imp[0] : `${imp[0]}: ${imp[1]}`)).join(',')} } = await _import('${moduleName}');`(),
              ]
            : [],
        ].flat(),
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

function tsToJs(code: string): string {
  return transpileModule(code, {
    compilerOptions: tsCompilerOptions,
  }).outputText;
}

function bundleFiles(files: Record<string, string>): string {
  const entryFile = files['index.ts'];
  if (!entryFile) {
    throw new Error("index.ts not found");
  }

  // Get a list of module names based on the other file keys (strip the .ts extension).
  const otherModules = Object.keys(files)
    .filter((filename) => filename !== 'index.ts')
    .map((filename) => filename.replace(/\.ts$/, ''));

  const entryLines = entryFile.split('\n');
  const filteredEntryLines = entryLines.filter((line) => {
    const importMatch = line.match(/from\s+['"](.+?)['"]/);
    if (importMatch) {
      let moduleName = importMatch[1];
      // Normalize relative paths "./module" -> "module")
      moduleName = moduleName.replace(/^\.\/|^\.\.\//, '');
      moduleName = moduleName.replace(/\.ts$/, '');
      if (otherModules.includes(moduleName)) {
        return false;
      }
    }
    return true;
  });
  const newEntryContent = filteredEntryLines.join('\n');

  let bundled = newEntryContent;
  for (const [filename, content] of Object.entries(files)) {
    if (filename === 'index.ts') continue;
    // Remove duplicate import statements from inlined content.
    const cleanedContent = content
      .split('\n')
      .filter((line) => {
        if (/^\s*import\s/.test(line)) {
          return true;
        }
        return true;
      })
      .join('\n');

    bundled += `\n\n// Inlined content from ${filename}\n${cleanedContent}`;
  }

  console.log("BUNDLED", bundled);
  return bundled;
}

type Labelless<T> = T extends unknown ? Omit<T, 'label'> : never;

export async function executeExample(
  exampleCode: Record<string, string>,
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
      if (moduleKey === 'typegpu/std') {
        return await import('typegpu/std');
      }
      if (moduleKey === '@typegpu/example-toolkit') {
        return {
          onCleanup(callback: () => unknown) {
            cleanupCallbacks.push(callback);
          },
          addParameters,
        };
      }
      if (moduleKey === 'wgpu-matrix') {
        return await import('wgpu-matrix');
      }
      throw new Error(`Module ${moduleKey} is not available in the sandbox.`);
    };

    // Bundle index.ts and its dependencies.
    const bundledTs = bundleFiles(exampleCode);

    const jsCode = tsToJs(bundledTs);

    const transformedCode =
      Babel.transform(jsCode, {
        compact: false,
        retainLines: true,
        plugins: [exportedOptionsToExampleControls, staticToDynamicImports],
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
