import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { NodePath, TraverseOptions } from '@babel/traverse';
import type * as babel from '@babel/types';
import { transpileFn } from 'tinyest-for-wgsl';
import {
  type Context,
  type KernelDirective,
  type TypegpuPluginOptions,
  embedJSON,
  gatherTgpuAliases,
  isShellImplementationCall,
  isTgpu,
  kernelDirectives,
  shouldSkipFile,
} from './common';

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
  name?: string | undefined,
): babel.CallExpression | null {
  const directive = getKernelDirective(node);
  if (!directive) {
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
      directive === 'kernel & js'
        ? node
        : template.expression`${tgpuAlias}.__removedJsImpl(${name ? `"${name}"` : ''})`(),
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
  const declarationStack: {
    name: string;
    path: NodePath<babel.VariableDeclarator>;
    shouldBeAutoNamed: boolean;
  }[] = [];
  return {
    ImportDeclaration(path) {
      gatherTgpuAliases(path.node, ctx);
    },

    VariableDeclarator: {
      enter(path) {
        if (path.node.id.type === 'Identifier') {
          declarationStack.push({
            name: path.node.id.name,
            path,
            shouldBeAutoNamed: false,
          });
        }
      },

      exit(path) {
        if (path.node.id.type === 'Identifier') {
          // biome-ignore lint/style/noNonNullAssertion:
          const { name, path, shouldBeAutoNamed } = declarationStack.pop()!;
          const node = path.node;

          if (ctx.autoNamingEnabled && shouldBeAutoNamed && node.init) {
            path.replaceWith(
              types.variableDeclarator(
                node.id,
                types.callExpression(
                  template.expression(
                    `${ctx.tgpuAliases.values().next().value}.__autoName`,
                  )(),
                  [node.init, template.expression(`"${name}"`)()],
                ),
              ),
            );
          }
        }

        path.skip();
      },
    },

    ArrowFunctionExpression(path) {
      const transpiled = functionToTranspiled(
        path.node,
        ctx,
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
      const transpiled = functionToTranspiled(expression, ctx, node.id?.name);
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

          const directive = getKernelDirective(implementation);

          path.replaceWith(
            types.callExpression(node.callee, [
              types.callExpression(
                template.expression(`${tgpuAlias}.__assignAst`)(),
                [
                  directive !== 'kernel & js'
                    ? template.expression`${tgpuAlias}.__removedJsImpl()`()
                    : implementation,
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

        const declaration = declarationStack[declarationStack.length - 1];
        if (declaration) {
          declaration.shouldBeAutoNamed = true;
        }
      }

      const callee = node.callee;

      if (
        callee?.type === 'MemberExpression' &&
        ((callee.object.type === 'Identifier' && isTgpu(ctx, callee.object)) ||
          (callee.object.type === 'MemberExpression' &&
            callee.object.object.type === 'Identifier' &&
            isTgpu(ctx, callee.object.object)))
      ) {
        const declaration = declarationStack[declarationStack.length - 1];
        if (declaration) {
          declaration.shouldBeAutoNamed = true;
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
          autoNamingEnabled: options?.autoNamingEnabled ?? true,
        };

        path.traverse(functionVisitor(ctx));
      },
    } satisfies TraverseOptions,
  };
}
