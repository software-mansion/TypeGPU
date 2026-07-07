import type { Context, JsNode } from './types.ts';

function isDeclared(ctx: Context, name: string) {
  return ctx.stack.some((scope) => scope.declaredNames.includes(name));
}

/**
 * Checks if the provided node is an external chain access.
 * @example
 * tryFindExternalChain(ctx, node`ext`); // 'ext'
 * tryFindExternalChain(ctx, node`ext.p.q`); // 'ext.p.q'
 * tryFindExternalChain(ctx, node`ext.p.q().r`); // undefined
 * tryFindExternalChain(ctx, node`local.p.q`); // undefined
 * tryFindExternalChain(ctx, node`ext.$.q`); // undefined
 */
export function tryFindExternalChain(ctx: Context, node: JsNode): string | undefined {
  if (ctx.visitedNodes.has(node)) {
    return;
  }
  ctx.visitedNodes.add(node);

  if (node.type === 'Identifier' && !isDeclared(ctx, node.name)) {
    return node.name;
  }
  if (node.type === 'ThisExpression') {
    return 'this';
  }
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    if (node.property.name === '$') {
      return;
    }
    const lhs = tryFindExternalChain(ctx, node.object);
    if (lhs) {
      return `${lhs}.${node.property.name}`;
    }
  }
}
