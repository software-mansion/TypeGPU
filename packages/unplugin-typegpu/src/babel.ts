import * as t from '@babel/types';
import type { NodePath, TraverseOptions } from '@babel/traverse';
import defu from 'defu';
import { transpileFn } from 'tinyest-for-wgsl';
import { FORMAT_VERSION } from 'tinyest';
import {
  type PluginState,
  defaultOptions,
  functionVisitor,
  getVisibilityScope,
  initPluginState,
} from './common.ts';
import { createFilterForId } from './filter.ts';

function i(identifier: string): t.Identifier {
  return t.identifier(identifier);
}

function assignMetadata(
  this: PluginState,
  path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression>,
  name: string | undefined,
  ast: ReturnType<typeof transpileFn>,
): void {
  const metadata = t.objectExpression([
    t.objectProperty(i('v'), t.numericLiteral(FORMAT_VERSION)),
    t.objectProperty(i('name'), t.valueToNode(name)),
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
  const visibility = t.isFunctionDeclaration(path.node)
    ? getVisibilityScope(this, path as NodePath<t.FunctionDeclaration>)
    : undefined;

  if (t.isFunctionDeclaration(path.node)) {
    expression = t.functionExpression(path.node.id, path.node.params, path.node.body);
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

  t.addComment(callExpr, 'leading', '#__PURE__');

  let replacement: t.Node = callExpr;

  if (t.isFunctionDeclaration(path.node) && path.node.id) {
    const declaration = t.variableDeclaration('const', [
      t.variableDeclarator(path.node.id, callExpr),
    ]);
    t.inheritLeadingComments(declaration, path.node);
    replacement = declaration;
  }

  if (visibility) {
    // Hoisting the declaration to the top of the scope
    visibility.unshiftContainer('body', replacement as t.Statement);
    this.alreadyTransformed.add(expression);
    path.remove();
  } else {
    path.replaceWith(replacement);
  }
  path.skip();
}

function wrapInAutoName(path: NodePath<t.Expression>, name: string): void {
  // /*#__PURE__*/(globalThis.__TYPEGPU_AUTONAME__ ?? (a => a))(<node>, '<name>')
  const callExpr = t.callExpression(
    t.logicalExpression(
      '??',
      // globalThis.__TYPEGPU_AUTONAME__
      t.memberExpression(i('globalThis'), i('__TYPEGPU_AUTONAME__')),
      // (a => a)
      t.arrowFunctionExpression([i('a')], i('a')),
    ),
    [path.node, t.stringLiteral(name)],
  );
  t.addComment(callExpr, 'leading', '#__PURE__');
  path.replaceWith(callExpr);
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
      this.opts = defu(this.opts, defaultOptions);
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
        const filter = createFilterForId(state.opts);
        if (state.filename && filter && !filter?.(state.filename)) {
          return;
        }

        path.traverse(functionVisitor, state);
      },
    } satisfies TraverseOptions<PluginState>,
  };
}
