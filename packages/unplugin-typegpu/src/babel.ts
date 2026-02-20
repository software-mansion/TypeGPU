import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { TraverseOptions } from '@babel/traverse';
import type * as babel from '@babel/types';
import defu from 'defu';
import { FORMAT_VERSION } from 'tinyest';
import { transpileFn } from 'tinyest-for-wgsl';
import {
  type Context,
  defaultOptions,
  embedJSON,
  gatherTgpuAliases,
  getFunctionName,
  isShellImplementationCall,
  type Options,
  performExpressionNaming,
  useGpuDirective,
} from './common.ts';
import { createFilterForId } from './filter.ts';

// NOTE: @babel/standalone does expose internal packages, as specified in the docs, but the
// typing for @babel/standalone does not expose them.
const template = (
  Babel as unknown as { packages: { template: typeof TemplateGenerator } }
).packages.template;
const types = (Babel as unknown as { packages: { types: typeof babel } })
  .packages.types;

function containsUseGpuDirective(
  node:
    | babel.FunctionDeclaration
    | babel.FunctionExpression
    | babel.ArrowFunctionExpression,
): boolean {
  return ((
    'directives' in node.body ? (node.body?.directives ?? []) : []
  )
    .map((directive) => directive.value.value))
    .includes(useGpuDirective);
}

function i(identifier: string): babel.Identifier {
  return types.identifier(identifier);
}

function functionToTranspiled(
  node: babel.ArrowFunctionExpression | babel.FunctionExpression,
  parent: babel.Node | null,
): babel.CallExpression {
  const { params, body, externalNames } = transpileFn(node);
  const maybeName = getFunctionName(node, parent);

  const metadata = types.objectExpression([
    types.objectProperty(
      i('v'),
      types.numericLiteral(FORMAT_VERSION),
    ),
    types.objectProperty(
      i('name'),
      maybeName ? types.stringLiteral(maybeName) : types.buildUndefinedNode(),
    ),
    types.objectProperty(
      i('ast'),
      template.expression`${embedJSON({ params, body, externalNames })}`(),
    ),
    types.objectProperty(
      i('externals'),
      types.arrowFunctionExpression(
        [],
        types.blockStatement([
          types.returnStatement(
            types.objectExpression(
              externalNames.map((name) =>
                types.objectProperty(
                  i(name),
                  i(name),
                  false,
                  /* shorthand */ name !== 'this',
                )
              ),
            ),
          ),
        ]),
      ),
    ),
  ]);

  return types.callExpression(
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
            metadata,
          ],
        ),
        types.memberExpression(i('$'), i('f')),
      ),
    ),
    [types.objectExpression([])],
  );
}

function wrapInAutoName(
  node: babel.Expression,
  name: string,
) {
  return types.callExpression(
    template.expression('globalThis.__TYPEGPU_AUTONAME__ ?? (a => a)', {
      placeholderPattern: false,
    })(),
    [node, types.stringLiteral(name)],
  );
}

function functionVisitor(ctx: Context): TraverseOptions {
  return {
    VariableDeclarator(path) {
      performExpressionNaming(ctx, path.node, (node, name) => {
        path.get('init').replaceWith(wrapInAutoName(node, name));
      });
    },

    AssignmentExpression(path) {
      performExpressionNaming(ctx, path.node, (node, name) => {
        path.get('right').replaceWith(wrapInAutoName(node, name));
      });
    },

    ObjectProperty(path) {
      performExpressionNaming(ctx, path.node, (node, name) => {
        path.get('value').replaceWith(wrapInAutoName(node, name));
      });
    },

    ClassProperty(path) {
      performExpressionNaming(ctx, path.node, (node, name) => {
        path.get('value').replaceWith(wrapInAutoName(node, name));
      });
    },

    ImportDeclaration(path) {
      gatherTgpuAliases(path.node, ctx);
    },

    ArrowFunctionExpression(path) {
      const node = path.node;
      const parent = path.parentPath.node;
      if (containsUseGpuDirective(node)) {
        path.replaceWith(functionToTranspiled(node, parent));
        path.skip();
      }
    },

    FunctionExpression(path) {
      const node = path.node;
      const parent = path.parentPath.node;
      if (containsUseGpuDirective(node)) {
        path.replaceWith(functionToTranspiled(node, parent));
        path.skip();
      }
    },

    FunctionDeclaration(path) {
      const node = path.node;
      const parent = path.parentPath.node;
      const expression = types.functionExpression(
        node.id,
        node.params,
        node.body,
      );

      if (containsUseGpuDirective(path.node) && node.id) {
        path.replaceWith(
          types.variableDeclaration('const', [
            types.variableDeclarator(
              node.id,
              functionToTranspiled(expression, parent),
            ),
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
            null,
          );

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

export default function () {
  return {
    visitor: {
      Program(path, state) {
        // oxlint-disable-next-line typescript/no-explicit-any <oh babel babel...>
        const options = defu((state as any).opts as Options, defaultOptions);
        // oxlint-disable-next-line typescript/no-explicit-any <oh babel babel...>
        const id: string | undefined = (state as any).filename;

        const filter = createFilterForId(options);
        if (id && filter && !filter?.(id)) {
          return;
        }

        const ctx: Context = {
          tgpuAliases: new Set<string>(
            options.forceTgpuAlias ? [options.forceTgpuAlias] : [],
          ),
          fileId: id,
          autoNamingEnabled: options.autoNamingEnabled,
        };

        path.traverse(functionVisitor(ctx));
      },
    } satisfies TraverseOptions,
  };
}
