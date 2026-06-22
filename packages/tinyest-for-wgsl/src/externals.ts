import type { Context, JsNode } from './types.ts';

export function isDeclared(ctx: Context, name: string) {
  return ctx.stack.some((scope) => scope.declaredNames.includes(name));
}

/**
 * Keeps the set of nodes visited by `tryFindExternalChain`.
 * This helps optimize code like `ext().x.y.z.t`:
 * instead of traversing chains `.x.y.z.t`, `.x.y.z`, `.x.y` and `.x`,
 * we only traverse the first one and then return early.
 */
const visitedMap: WeakMap<Context, Set<JsNode>> = new WeakMap();

/**
 * Checks if the provided node is an external chain access.
 * @example
 * tryFindExternalChain(ctx, node`ext`); // 'ext'
 * tryFindExternalChain(ctx, node`ext.p.q`); // 'ext.p.q'
 * tryFindExternalChain(ctx, node`ext.p.q().r`); // undefined
 * tryFindExternalChain(ctx, node`local.p.q`); // undefined
 */
export function tryFindExternalChain(ctx: Context, node: JsNode): string | undefined {
  let visited = visitedMap.get(ctx);
  if (!visited) {
    visited = new Set();
    visitedMap.set(ctx, visited);
  }
  if (visited.has(node)) {
    return;
  }
  visited.add(node);

  if (node.type === 'Identifier' && !isDeclared(ctx, node.name)) {
    return node.name;
  }
  if (node.type === 'ThisExpression') {
    return 'this';
  }
  if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
    const lhs = tryFindExternalChain(ctx, node.object);
    if (lhs) {
      return `${lhs}.${node.property.name}`;
    }
  }
}
