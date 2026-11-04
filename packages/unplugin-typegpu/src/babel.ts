import type { NodePath, TraverseOptions } from '@babel/traverse';
import defu from 'defu';
import type { Externals, TranspilationResult } from 'tinyest-for-wgsl';
import * as t from '@babel/types';
import {
  type PluginState,
  checkOpts,
  defaultOptions,
  functionVisitor,
  getBlockScope,
  initPluginState,
} from './core/common.ts';
import { createFilterForId } from './core/filter.ts';
import { META_HELPER, metadataJSON } from './core/metadataFormat.ts';

function i(identifier: string): t.Identifier {
  return t.identifier(identifier);
}

function externalsToNode(externals: Externals): t.Expression {
  return t.objectExpression(
    Array.from(externals, ([key, value]) => {
      const chain = value.split('.');
      if (!chain[0]) {
        throw new Error('Internal error, expected chain to not be empty');
      }
      const base = chain[0] === 'this' ? t.thisExpression() : i(chain[0]);
      const propAccess = chain
        .slice(1)
        .reduce<t.Expression>((obj, prop) => t.memberExpression(obj, t.identifier(prop)), base);

      return t.objectProperty(
        t.stringLiteral(key),
        t.arrowFunctionExpression([], propAccess),
        false,
      );
    }),
  );
}

function assignMetadata(
  this: PluginState,
  path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression | t.FunctionExpression>,
  name: string | undefined,
  ast: TranspilationResult,
): void {
  let expression: t.Expression;
  const visibility = t.isFunctionDeclaration(path.node)
    ? getBlockScope(path as NodePath<t.FunctionDeclaration>)
    : undefined;

  if (t.isFunctionDeclaration(path.node)) {
    expression = t.functionExpression(path.node.id, path.node.params, path.node.body);
  } else {
    expression = path.node as t.Expression;
  }

  const callExpr = t.callExpression(i(META_HELPER), [
    expression,
    t.stringLiteral(metadataJSON(ast)),
    externalsToNode(ast.externalNames),
    ...(name ? [t.stringLiteral(name)] : []),
  ]);
  this.usesMetaHelper = true;

  t.addComment(callExpr, 'leading', '#__PURE__');

  let replacement: t.Node = callExpr;

  if (t.isFunctionDeclaration(path.node) && path.node.id) {
    const declaration = t.variableDeclaration('let', [
      t.variableDeclarator(path.node.id, callExpr),
    ]);
    t.inheritLeadingComments(declaration, path.node);

    if (
      path.parentPath &&
      (path.parentPath.isExportNamedDeclaration() || path.parentPath.isExportDefaultDeclaration())
    ) {
      t.inheritLeadingComments(declaration, path.parentPath.node);
      path.parentPath.node.leadingComments = null;
    }
    replacement = declaration;
  }

  if (visibility) {
    // Hoisting the declaration to the top of the scope
    visibility.unshiftContainer('body', replacement as t.Statement);

    const id = t.isFunctionDeclaration(path.node) ? path.node.id : undefined;
    if (id && path.parentPath.isExportNamedDeclaration()) {
      path.parentPath.replaceWith(
        t.exportNamedDeclaration(null, [t.exportSpecifier(t.cloneNode(id), t.cloneNode(id))]),
      );
    } else if (id && path.parentPath.isExportDefaultDeclaration()) {
      path.parentPath.replaceWith(
        t.exportNamedDeclaration(null, [t.exportSpecifier(t.cloneNode(id), i('default'))]),
      );
    } else {
      path.remove();
    }
  } else {
    path.replaceWith(replacement);
  }
  path.skip();
}

/**
 * `const __tgpu_meta = (f, ...m) => ((globalThis.__TYPEGPU_META__ ??= new WeakMap()).set(f, m), f);`
 */
function metaHelperDeclaration(): t.VariableDeclaration {
  const metaMap = t.assignmentExpression(
    '??=',
    t.memberExpression(i('globalThis'), i('__TYPEGPU_META__')),
    t.newExpression(i('WeakMap'), []),
  );
  const register = t.callExpression(t.memberExpression(metaMap, i('set')), [i('f'), i('m')]);
  return t.variableDeclaration('const', [
    t.variableDeclarator(
      i(META_HELPER),
      t.arrowFunctionExpression(
        [i('f'), t.restElement(i('m'))],
        t.sequenceExpression([register, i('f')]),
      ),
    ),
  ]);
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
      this.opts = checkOpts(defu(this.opts, defaultOptions));
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

        if (state.usesMetaHelper) {
          path.unshiftContainer('body', metaHelperDeclaration());
        }
      },
    } satisfies TraverseOptions<PluginState>,
  };
}
