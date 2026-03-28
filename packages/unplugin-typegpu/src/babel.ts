import * as Babel from '@babel/standalone';
import type TemplateGenerator from '@babel/template';
import type { NodePath, TraverseOptions } from '@babel/traverse';
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
  operators,
  type Options,
  performExpressionNaming,
  useGpuDirective,
} from './common.ts';
import { createFilterForId } from './filter.ts';

// NOTE: @babel/standalone does expose internal packages, as specified in the docs, but the
// typing for @babel/standalone does not expose them.
const template = (Babel as unknown as { packages: { template: typeof TemplateGenerator } }).packages
  .template;
const types = (Babel as unknown as { packages: { types: typeof babel } }).packages.types;

function containsUseGpuDirective(
  node: babel.FunctionDeclaration | babel.FunctionExpression | babel.ArrowFunctionExpression,
): boolean {
  return ('directives' in node.body ? (node.body?.directives ?? []) : [])
    .map((directive) => directive.value.value)
    .includes(useGpuDirective);
}

function i(identifier: string): babel.Identifier {
  return types.identifier(identifier);
}

const fnNodeToOriginalMap = new WeakMap<
  babel.FunctionDeclaration | babel.FunctionExpression | babel.ArrowFunctionExpression,
  babel.FunctionDeclaration | babel.FunctionExpression | babel.ArrowFunctionExpression
>();

function functionToTranspiled(
  node: babel.ArrowFunctionExpression | babel.FunctionExpression,
  parent: babel.Node | null,
): babel.CallExpression {
  const { params, body, externalNames } = transpileFn(fnNodeToOriginalMap.get(node) ?? node);
  const maybeName = getFunctionName(node, parent);

  const metadata = types.objectExpression([
    types.objectProperty(i('v'), types.numericLiteral(FORMAT_VERSION)),
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
                types.objectProperty(i(name), i(name), false, /* shorthand */ name !== 'this'),
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
          [types.assignmentExpression('=', types.memberExpression(i('$'), i('f')), node), metadata],
        ),
        types.memberExpression(i('$'), i('f')),
      ),
    ),
    [types.objectExpression([])],
  );
}

function wrapInAutoName(node: babel.Expression, name: string) {
  return types.callExpression(
    template.expression('globalThis.__TYPEGPU_AUTONAME__ ?? (a => a)', {
      placeholderPattern: false,
    })(),
    [node, types.stringLiteral(name)],
  );
}

type UseGpuFunctionPath = NodePath<
  babel.FunctionDeclaration | babel.FunctionExpression | babel.ArrowFunctionExpression
>;

function objectDestructuringError(message: string): Error {
  return new Error(`Unsupported object destructuring in "use gpu" functions: ${message}`);
}

function hasObjectPatternDeclaration(node: babel.VariableDeclaration): boolean {
  return node.declarations.some((decl) => decl.id.type === 'ObjectPattern');
}

function expandObjectPatternDeclaration(
  node: babel.VariableDeclaration,
  path: NodePath<babel.VariableDeclaration>,
): babel.VariableDeclaration[] | null {
  if (!hasObjectPatternDeclaration(node)) {
    return null;
  }

  const expanded: babel.VariableDeclaration[] = [];

  for (const declarator of node.declarations) {
    if (declarator.id.type === 'Identifier') {
      expanded.push(
        types.variableDeclaration(node.kind, [types.cloneNode(declarator, true)]),
      );
      continue;
    }

    if (declarator.id.type !== 'ObjectPattern') {
      throw objectDestructuringError('only flat object patterns are supported');
    }

    if (!declarator.init) {
      throw objectDestructuringError('an initializer is required');
    }

    let objectSource = declarator.init;

    if (objectSource.type !== 'Identifier') {
      const tmpId = path.scope.generateUidIdentifier('tmp');

      expanded.push(
        types.variableDeclaration(node.kind, [
          types.variableDeclarator(tmpId, types.cloneNode(objectSource, true)),
        ]),
      );
      objectSource = tmpId;
    }

    for (const property of declarator.id.properties) {
      if (property.type === 'RestElement') {
        throw objectDestructuringError('rest properties are not supported');
      }

      if (property.type !== 'ObjectProperty') {
        throw objectDestructuringError('only plain object properties are supported');
      }

      if (property.computed || property.key.type !== 'Identifier') {
        throw objectDestructuringError('only identifier property names are supported');
      }

      if (property.value.type !== 'Identifier') {
        if (property.value.type === 'AssignmentPattern') {
          throw objectDestructuringError('default values are not supported');
        }

        throw objectDestructuringError('nested destructuring is not supported');
      }

      expanded.push(
        types.variableDeclaration(node.kind, [
          types.variableDeclarator(
            types.cloneNode(property.value, true),
            types.memberExpression(
              types.cloneNode(objectSource, true),
              types.identifier(property.key.name),
            ),
          ),
        ]),
      );
    }
  }

  return expanded;
}

function normalizeObjectDestructuring(path: UseGpuFunctionPath) {
  path.traverse({
    Function(innerPath) {
      if (innerPath.node !== path.node) {
        innerPath.skip();
      }
    },

    VariableDeclaration(innerPath) {
      if (hasObjectPatternDeclaration(innerPath.node)) {
        const parentPath = innerPath.parentPath;
        if (!parentPath.isBlockStatement() && !parentPath.isProgram()) {
          throw objectDestructuringError(
            'unsupported object destructuring in non-block variable declaration (e.g. for-loop initializer or for-of/in)',
          );
        }
      }

      const expanded = expandObjectPatternDeclaration(innerPath.node, innerPath);
      if (!expanded) {
        return;
      }

      innerPath.replaceWithMultiple(expanded);
      innerPath.skip();
    },
  });
}

function functionVisitor(ctx: Context): TraverseOptions {
  let inUseGpuScope = false;

  return {
    VariableDeclarator(path) {
      performExpressionNaming(ctx, path.node, (node, name) => {
        path.get('init').replaceWith(wrapInAutoName(node, name));
      });
    },

    AssignmentExpression(path) {
      if (inUseGpuScope) {
        const runtimeFn = operators[path.node.operator as keyof typeof operators];

        if (runtimeFn) {
          path.replaceWith(
            types.assignmentExpression(
              '=',
              path.node.left,
              types.callExpression(types.identifier(runtimeFn), [
                path.node.left as babel.Expression,
                path.node.right,
              ]),
            ),
          );
        }
      }

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

    BinaryExpression: {
      exit(path) {
        if (!inUseGpuScope) {
          return;
        }

        const runtimeFn = operators[path.node.operator as keyof typeof operators];

        if (runtimeFn) {
          path.replaceWith(
            types.callExpression(types.identifier(runtimeFn), [
              path.node.left as babel.Expression,
              path.node.right,
            ]),
          );
        }
      },
    },

    ArrowFunctionExpression: {
      enter(path) {
        if (containsUseGpuDirective(path.node)) {
          normalizeObjectDestructuring(path);
          fnNodeToOriginalMap.set(path.node, types.cloneNode(path.node, true));
          if (inUseGpuScope) {
            throw new Error(`Nesting 'use gpu' functions is not allowed`);
          }
          inUseGpuScope = true;
        }
      },
      exit(path) {
        const node = path.node;
        if (containsUseGpuDirective(node)) {
          inUseGpuScope = false;
          const parent = path.parentPath.node;
          path.replaceWith(functionToTranspiled(node, parent));
          path.skip();
        }
      },
    },

    FunctionExpression: {
      enter(path) {
        if (containsUseGpuDirective(path.node)) {
          normalizeObjectDestructuring(path);
          fnNodeToOriginalMap.set(path.node, types.cloneNode(path.node, true));
          if (inUseGpuScope) {
            throw new Error(`Nesting 'use gpu' functions is not allowed`);
          }
          inUseGpuScope = true;
        }
      },
      exit(path) {
        const node = path.node;
        if (containsUseGpuDirective(node)) {
          inUseGpuScope = false;
          const parent = path.parentPath.node;
          path.replaceWith(functionToTranspiled(node, parent));
          path.skip();
        }
      },
    },

    FunctionDeclaration: {
      enter(path) {
        if (containsUseGpuDirective(path.node)) {
          normalizeObjectDestructuring(path);
          fnNodeToOriginalMap.set(path.node, types.cloneNode(path.node, true));
          if (inUseGpuScope) {
            throw new Error(`Nesting 'use gpu' functions is not allowed`);
          }
          inUseGpuScope = true;
        }
      },
      exit(path) {
        const node = (fnNodeToOriginalMap.get(path.node) ?? path.node) as babel.FunctionDeclaration;
        if (containsUseGpuDirective(node)) {
          inUseGpuScope = false;

          if (!node.id) {
            return;
          }

          const parent = path.parentPath.node;
          const expression = types.functionExpression(node.id, node.params, node.body);

          path.replaceWith(
            types.variableDeclaration('const', [
              types.variableDeclarator(node.id, functionToTranspiled(expression, parent)),
            ]),
          );
          path.skip();
        }
      },
    },

    CallExpression: {
      exit(path) {
        const node = path.node;

        if (isShellImplementationCall(node, ctx)) {
          const implementation = node.arguments[0];

          if (
            implementation &&
            (implementation.type === 'FunctionExpression' ||
              implementation.type === 'ArrowFunctionExpression')
          ) {
            const transpiled = functionToTranspiled(implementation, null);

            path.replaceWith(types.callExpression(node.callee, [transpiled]));

            path.skip();
          }
        }
      },
    },
  };
}

export default function () {
  return {
    visitor: {
      Program(path, state) {
        // oxlint-disable-next-line typescript/no-explicit-any -- <oh babel babel...>
        const options = defu((state as any).opts as Options, defaultOptions);
        // oxlint-disable-next-line typescript/no-explicit-any -- <oh babel babel...>
        const id: string | undefined = (state as any).filename;

        const filter = createFilterForId(options);
        if (id && filter && !filter?.(id)) {
          return;
        }

        const ctx: Context = {
          tgpuAliases: new Set<string>(options.forceTgpuAlias ? [options.forceTgpuAlias] : []),
          fileId: id,
          autoNamingEnabled: options.autoNamingEnabled,
        };

        path.traverse(functionVisitor(ctx));
      },
    } satisfies TraverseOptions,
  };
}
