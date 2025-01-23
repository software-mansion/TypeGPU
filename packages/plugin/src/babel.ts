import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import type * as t from '@babel/types';
import { transpileFn } from 'tinyest-for-wgsl';
import {
  type Context,
  type TypegpuPluginOptions,
  embedJSON,
  isTgpu,
  typegpuDynamicImportRegex,
  typegpuImportRegex,
  typegpuRequireRegex,
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
      const node = path.node;
      if (node.source.value === 'typegpu') {
        for (const spec of node.specifiers) {
          if (
            // The default export of 'typegpu' is the `tgpu` object.
            spec.type === 'ImportDefaultSpecifier' ||
            // Aliasing 'tgpu' while importing, e.g. import { tgpu as t } from 'typegpu';
            (spec.type === 'ImportSpecifier' &&
              spec.imported.type === 'Identifier' &&
              spec.imported.name === 'tgpu')
          ) {
            ctx.tgpuAliases.add(spec.local.name);
          } else if (spec.type === 'ImportNamespaceSpecifier') {
            // Importing everything, e.g. import * as t from 'typegpu';
            ctx.tgpuAliases.add(`${spec.local.name}.tgpu`);
          }
        }
      }
    },

    CallExpression(path) {
      const node = path.node;

      if (
        node.callee.type === 'MemberExpression' &&
        node.arguments.length === 1 &&
        node.callee.property.type === 'Identifier' &&
        ((node.callee.property.name === 'procedure' &&
          isTgpu(ctx, node.callee.object)) ||
          // Assuming that every call to `.does` is related to TypeGPU
          // because shells can be created separately from calls to `tgpu`,
          // making it hard to detect.
          node.callee.property.name === 'does')
      ) {
        const implementation = node.arguments[0];

        if (
          implementation &&
          !(implementation.type === 'TemplateLiteral') &&
          !(implementation.type === 'StringLiteral')
        ) {
          const { argNames, body, externalNames } = transpileFn(implementation);

          path.replaceWith(
            types.callExpression(node.callee, [
              types.callExpression(template.expression('tgpu.__assignAst')(), [
                implementation,
                template.expression`${embedJSON({ argNames, body, externalNames })}`(),
                externalNames.length > 0
                  ? template.expression`{${externalNames.join(', ')}}`()
                  : template.expression`undefined`(),
              ]),
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

        if (code && !options?.include) {
          if (
            !typegpuImportRegex.test(code) &&
            !typegpuRequireRegex.test(code) &&
            !typegpuDynamicImportRegex.test(code)
          ) {
            // No imports to `typegpu` or its sub modules, exiting early.
            return;
          }
        } else if (
          options?.include &&
          options.include !== 'all' &&
          (!id || !options.include.some((pattern) => pattern.test(id)))
        ) {
          return;
        }

        const ctx: Context = {
          tgpuAliases: new Set(['tgpu']),
        };

        path.traverse(functionVisitor(ctx));
      },
    } satisfies TraverseOptions,
  };
}
