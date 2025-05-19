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

function functionToTranspiled(
  node: babel.ArrowFunctionExpression | babel.FunctionExpression,
  ctx: Context,
  directive: 'kernel' | 'kernel & js' | undefined,
  name?: string | undefined,
): babel.CallExpression | null {
  if (!directive) {
    return null;
  }

  const { argNames, body, externalNames } = transpileFn(node);
  const tgpuAlias = ctx.tgpuAliases.values().next().value;
  if (tgpuAlias === undefined) {
    throw new Error(
      `No tgpu import found, cannot assign ast to function in file: ${
        ctx.fileId ?? ''
      }`,
    );
  }

  return types.callExpression(
    template.expression(`${tgpuAlias}.__assignAst`)(),
    [
      directive !== 'kernel & js'
        ? template.expression`${tgpuAlias}.__removedJsImpl(${
          name ? `"${name}"` : ''
        })`()
        : node,
      template.expression`${embedJSON({ argNames, body, externalNames })}`(),
      types.objectExpression(
        externalNames.map((name) =>
          types.objectProperty(
            types.identifier(name),
            types.identifier(name),
          )
        ),
      ),
    ],
  );
}

function functionVisitor(ctx: Context): TraverseOptions {
  return {
    ImportDeclaration(path) {
      gatherTgpuAliases(path.node, ctx);
    },

    ArrowFunctionExpression(path) {
      const transpiled = functionToTranspiled(
        path.node,
        ctx,
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
        ctx,
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
        ctx,
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
            ctx,
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
