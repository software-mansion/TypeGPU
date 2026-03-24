import * as t from '@babel/types';
import type { NodePath, TraverseOptions } from '@babel/traverse';
import defu from 'defu';
import {
  type PluginState,
  defaultOptions,
  functionVisitor,
  getVisibilityScope,
  initPluginState,
} from './common.ts';
import { createFilterForId } from './filter.ts';
import { transpileFn } from 'tinyest-for-wgsl';
import { FORMAT_VERSION } from 'tinyest';

function i(identifier: string): t.Identifier {
  return t.identifier(identifier);
}

function assignMetadata(
  this: PluginState,
  path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression>,
  name: string,
  ast: ReturnType<typeof transpileFn>,
): void {
  const metadata = t.objectExpression([
    t.objectProperty(i('v'), t.numericLiteral(FORMAT_VERSION)),
    t.objectProperty(
      i('name'),
      // TODO: Try t.valueToNode(name)
      name ? t.stringLiteral(name) : t.buildUndefinedNode(),
    ),
    t.objectProperty(i('ast'), t.valueToNode(ast)),
    t.objectProperty(
      i('externals'),
      t.arrowFunctionExpression(
        [],
        t.blockStatement([
          t.returnStatement(
            t.objectExpression(
              ast.externalNames.map((name) =>
                t.objectProperty(i(name), i(name), false, /* shorthand */ name !== 'this'),
              ),
            ),
          ),
        ]),
      ),
    ),
  ]);

  let expression: t.Expression;
  const fnDecl = path.node as t.FunctionDeclaration;
  const visibility = t.isFunctionDeclaration(path.node)
    ? getVisibilityScope(this, path as NodePath<t.FunctionDeclaration>)
    : undefined;
  if (visibility) {
    expression = t.functionExpression(fnDecl.id!, fnDecl.params, fnDecl.body);
  } else {
    expression = path.node as t.Expression;
  }

  const callExpr = t.callExpression(
    t.arrowFunctionExpression(
      [i('$')],
      t.logicalExpression(
        '&&',
        t.callExpression(
          t.memberExpression(
            t.assignmentExpression(
              '??=',
              t.memberExpression(i('globalThis'), i('__TYPEGPU_META__')),
              t.newExpression(i('WeakMap'), []),
            ),
            i('set'),
          ),
          [t.assignmentExpression('=', t.memberExpression(i('$'), i('f')), expression), metadata],
        ),
        t.memberExpression(i('$'), i('f')),
      ),
    ),
    [t.objectExpression([])],
  );

  if (visibility) {
    const declaration = t.variableDeclaration('const', [
      t.variableDeclarator(i(visibility.name), callExpr),
    ]);
    declaration.leadingComments = fnDecl.leadingComments ?? null;

    // Hoisting the declaration to the top of the scope
    visibility.scope.unshiftContainer('body', declaration);
    this.alreadyTransformed.add(expression);
    path.remove();
  } else {
    path.replaceWith(callExpr);
  }
  path.skip();
}

function wrapInAutoName(path: NodePath<t.Expression>, name: string): void {
  // (globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(<node>, '<name>')
  path.replaceWith(
    t.callExpression(
      t.logicalExpression(
        '??',
        // globalThis.__TYPEGPU_AUTONAME__
        t.memberExpression(i('globalThis'), i('__TYPEGPU_AUTONAME__')),
        // (a => a)
        t.arrowFunctionExpression([i('a')], i('a')),
      ),
      [path.node, t.stringLiteral(name)],
    ),
  );
}

function replaceWithAssignmentOverload(
  path: NodePath<t.AssignmentExpression>,
  runtimeFn: string,
): void {
  path.replaceWith(
    t.assignmentExpression(
      '=',
      path.node.left,
      t.callExpression(i(runtimeFn), [path.node.left as t.Expression, path.node.right]),
    ),
  );
}

function replaceWithBinaryOverload(path: NodePath<t.BinaryExpression>, runtimeFn: string): void {
  path.replaceWith(
    t.callExpression(i(runtimeFn), [path.node.left as t.Expression, path.node.right]),
  );
}

export default function TypeGPUPlugin() {
  return {
    name: 'typegpu',
    pre(this: PluginState) {
      initPluginState(this, {
        warn: (message) => console.warn(message),
        assignMetadata,
        wrapInAutoName,
        replaceWithAssignmentOverload,
        replaceWithBinaryOverload,
      });
    },
    visitor: {
      Program(path, state) {
        const options = defu(state.opts, defaultOptions);

        const filter = createFilterForId(options);
        if (state.filename && filter && !filter?.(state.filename)) {
          return;
        }

        path.traverse(functionVisitor, state);
      },
    } satisfies TraverseOptions<PluginState>,
  };
}
