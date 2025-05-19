import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import type * as babel from '@babel/types';
import { transpileFn } from 'tinyest-for-wgsl';
import {
  type Context,
  embedJSON,
  gatherTgpuAliases,
  isShellImplementationCall,
  type KernelDirective,
  kernelDirectives,
  type Options,
} from './common.ts';
import { createFilterForId } from './filter.ts';
import { ArgNames, Block } from '../../tinyest/src/nodes.ts';

// NOTE: @babel/standalone does expose internal packages, as specified in the docs, but the
// typing for @babel/standalone does not expose them.
const template = (
  Babel as unknown as { packages: { template: typeof TemplateGenerator } }
).packages.template;
const types = (Babel as unknown as { packages: { types: typeof babel } })
  .packages.types;

function getKernelDirective(
  node:
    | babel.FunctionDeclaration
    | babel.FunctionExpression
    | babel.ArrowFunctionExpression,
): KernelDirective | undefined {
  const directives = (
    'directives' in node.body ? (node.body?.directives ?? []) : []
  ).map((directive) => directive.value.value);

  for (const directive of kernelDirectives) {
    if (directives.includes(directive)) {
      return directive;
    }
  }
}

// AAA does syntax do usunięcia

// const addGPU = (($) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(
//   $.f = ...,
//   {
//     ast: {...},
//     externals: {...},
//   },
// ) && $.f))({});

function i(identifier: string): babel.Identifier {
  return types.identifier(identifier);
}

function functionToTranspiled(
  node: babel.ArrowFunctionExpression | babel.FunctionExpression,
  directive: 'kernel' | 'kernel & js' | undefined,
  name?: string | undefined,
): babel.CallExpression | null {
  if (!directive) {
    return null;
  }

  const { argNames, body, externalNames } = transpileFn(node);

  const metadata = `{
    ast: ${embedJSON({ argNames, body, externalNames })},
    externals: {${externalNames.join(', ')}},
  }`;

  const newNode = types.callExpression(
    types.arrowFunctionExpression(
      [i('$')],
      types.logicalExpression(
        '&&',
        types.callExpression(
          types.memberExpression(
            types.assignmentExpression(
              '??=',
              types.memberExpression(i('globalThis'), i('__TYPEGPU_META__')),
              types.newExpression(i('WeakMap'), []),
            ),
            i('set'),
          ),
          [
            types.assignmentExpression(
              '=',
              types.memberExpression(i('$'), i('f')),
              node,
            ),
            template.expression`${metadata}`(),
          ],
        ),
        types.memberExpression(i('$'), i('f')),
      ),
    ),
    [
      types.objectExpression([]),
    ],
  );
  return newNode;
}

function functionVisitor(ctx: Context): TraverseOptions {
  return {
    ImportDeclaration(path) {
      gatherTgpuAliases(path.node, ctx);
    },

    ArrowFunctionExpression(path) {
      const transpiled = functionToTranspiled(
        path.node,
        getKernelDirective(path.node),
        path.parentPath.node.type === 'VariableDeclarator'
          ? path.parentPath.node.id.type === 'Identifier'
            ? path.parentPath.node.id.name
            : undefined
          : undefined,
      );
      if (transpiled) {
        path.replaceWith(transpiled);
        path.skip();
      }
    },

    FunctionExpression(path) {
      const transpiled = functionToTranspiled(
        path.node,
        getKernelDirective(path.node),
        path.node.id?.name
          ? path.node.id.name
          : path.parentPath.node.type === 'VariableDeclarator'
          ? path.parentPath.node.id.type === 'Identifier'
            ? path.parentPath.node.id.name
            : undefined
          : undefined,
      );
      if (transpiled) {
        path.replaceWith(transpiled);
        path.skip();
      }
    },

    FunctionDeclaration(path) {
      const node = path.node;
      const expression = types.functionExpression(
        node.id,
        node.params,
        node.body,
      );
      const transpiled = functionToTranspiled(
        expression,
        getKernelDirective(path.node),
        node.id?.name,
      );
      if (transpiled && node.id) {
        path.replaceWith(
          types.variableDeclaration('const', [
            types.variableDeclarator(node.id, transpiled),
          ]),
        );
        path.skip();
      }
    },

    CallExpression(path) {
      const node = path.node;

      if (isShellImplementationCall(node, ctx)) {
        const implementation = node.arguments[0];

        if (
          implementation &&
          (implementation.type === 'FunctionExpression' ||
            implementation.type === 'ArrowFunctionExpression')
        ) {
          const transpiled = functionToTranspiled(
            implementation,
            getKernelDirective(implementation) ?? 'kernel',
          ) as babel.CallExpression;

          path.replaceWith(
            types.callExpression(node.callee, [
              transpiled,
            ]),
          );

          path.skip();
        }
      }
    },
  };
}

const typegpuImportRegex = /import.*from\s*['"]typegpu.*['"]/;
const typegpuDynamicImportRegex = /import\s*\(\s*['"]\s*typegpu.*['"]/;
const typegpuRequireRegex = /require\s*\(\s*['"]\s*typegpu.*['"]\s*\)/;

/**
 * Regexes used to efficiently determine if a file is
 * meant to be processed by our plugin. We assume every file
 * that should be processed imports `typegpu` in some way.
 */
export const codeFilterRegexes = [
  typegpuImportRegex,
  typegpuDynamicImportRegex,
  typegpuRequireRegex,
];

export default function () {
  return {
    visitor: {
      Program(path, state) {
        // biome-ignore lint/suspicious/noExplicitAny: <oh babel babel...>
        const code: string | undefined = (state as any).file?.code;
        // biome-ignore lint/suspicious/noExplicitAny: <oh babel babel...>
        const options: Options | undefined = (state as any).opts;
        // biome-ignore lint/suspicious/noExplicitAny: <oh babel babel...>
        const id: string | undefined = (state as any).filename;

        const filter = createFilterForId(options);
        if (id && filter && !filter?.(id)) {
          return;
        }

        if (
          !options?.forceTgpuAlias &&
          code &&
          !codeFilterRegexes.some((reg) => reg.test(code))
        ) {
          return;
        }

        const ctx: Context = {
          tgpuAliases: new Set<string>(
            options?.forceTgpuAlias ? [options.forceTgpuAlias] : [],
          ),
          fileId: id,
        };

        path.traverse(functionVisitor(ctx));
      },
    } satisfies TraverseOptions,
  };
}
