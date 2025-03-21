import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import type * as babel from '@babel/types';
import { transpileFn } from 'tinyest-for-wgsl';
import {
  type Context,
  type TypegpuPluginOptions,
  embedJSON,
  gatherTgpuAliases,
  isShellImplementationCall,
  shouldSkipFile,
} from './common';

// NOTE: @babel/standalone does expose internal packages, as specified in the docs, but the
// typing for @babel/standalone does not expose them.
const template = (
  Babel as unknown as { packages: { template: typeof TemplateGenerator } }
).packages.template;
const types = (Babel as unknown as { packages: { types: typeof babel } })
  .packages.types;

function isKernelMarkedFunction(
  node:
    | babel.FunctionDeclaration
    | babel.FunctionExpression
    | babel.ArrowFunctionExpression,
) {
  const directives = (
    'directives' in node.body ? (node.body?.directives ?? []) : []
  ).map((directive) => directive.value.value);

  return directives.includes('kernel');
}

function functionToTranspiled(
  node: babel.ArrowFunctionExpression | babel.FunctionExpression,
  ctx: Context,
): babel.CallExpression | null {
  if (!isKernelMarkedFunction(node)) {
    return null;
  }

  const { argNames, body, externalNames } = transpileFn(node);
  const tgpuAlias = ctx.tgpuAliases.values().next().value;
  if (tgpuAlias === undefined) {
    throw new Error(
      `No tgpu import found, cannot assign ast to function in file: ${ctx.fileId ?? ''}`,
    );
  }

  return types.callExpression(
    template.expression(`${tgpuAlias}.__assignAst`)(),
    [
      node,
      template.expression`${embedJSON({ argNames, body, externalNames })}`(),
      types.objectExpression(
        externalNames.map((name) =>
          types.objectProperty(types.identifier(name), types.identifier(name)),
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
      const transpiled = functionToTranspiled(path.node, ctx);
      if (transpiled) {
        path.replaceWith(transpiled);
        path.skip();
      }
    },

    FunctionExpression(path) {
      const transpiled = functionToTranspiled(path.node, ctx);
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
      const transpiled = functionToTranspiled(expression, ctx);
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
          const { argNames, body, externalNames } = transpileFn(implementation);
          const tgpuAlias = ctx.tgpuAliases.values().next().value;
          if (tgpuAlias === undefined) {
            throw new Error(
              `No tgpu import found, cannot assign ast to function in file: ${ctx.fileId ?? ''}`,
            );
          }

          path.replaceWith(
            types.callExpression(node.callee, [
              types.callExpression(
                template.expression(`${tgpuAlias}.__assignAst`)(),
                [
                  implementation,
                  template.expression`${embedJSON({ argNames, body, externalNames })}`(),
                  types.objectExpression(
                    externalNames.map((name) =>
                      types.objectProperty(
                        types.identifier(name),
                        types.identifier(name),
                      ),
                    ),
                  ),
                ],
              ),
            ]),
          );

          path.skip();
        }
      }
    },
  };
}

export default function () {
  return {
    visitor: {
      Program(path, state) {
        // @ts-ignore
        const code: string | undefined = state.file?.code;
        // @ts-ignore
        const options: TypegpuPluginOptions | undefined = state.opts;
        // @ts-ignore
        const id: string | undefined = state.filename;

        if (shouldSkipFile(options, id, code)) {
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
