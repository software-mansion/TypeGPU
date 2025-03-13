import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import type * as t from '@babel/types';
import { transpileFn } from 'tinyest-for-wgsl';
import {
  type Context,
  type TypegpuPluginOptions,
  embedJSON,
  gatherTgpuAliases,
  isDoesCall,
  shouldSkipFile,
} from './common';

// NOTE: @babel/standalone does expose internal packages, as specified in the docs, but the
// typing for @babel/standalone does not expose them.
const template = (
  Babel as unknown as { packages: { template: typeof TemplateGenerator } }
).packages.template;
const types = (Babel as unknown as { packages: { types: typeof t } }).packages
  .types;

function functionVisitor(ctx: Context): TraverseOptions {
  return {
    ImportDeclaration(path) {
      gatherTgpuAliases(path.node, ctx);
    },

    CallExpression(path) {
      const node = path.node;

      if (isDoesCall(node, ctx)) {
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
