import type { Context, JsNode } from './types.ts';

function isDeclared(ctx: Context, name: string) {
  const minifiedName = ctx.minifier.getIfMinified(name);
  if (!minifiedName) {
    return false;
  }
  return ctx.stack.some((scope) => scope.declaredNames.includes(minifiedName));
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
  if (node.type === 'Identifier' && !isDeclared(ctx, node.name)) {
    return node.name;
  }
  if (node.type === 'ThisExpression') {
    return 'this';
  }
  if (node.type === 'MemberExpression' && !node.computed) {
    if (ctx.visitedNodes.has(node)) {
      return;
    }
    ctx.visitedNodes.add(node);

    let property;
    if (node.property.type === 'Identifier' && node.property.name !== '$') {
      property = node.property.name;
    } else if (node.property.type === 'PrivateName') {
      property = `#${node.property.id.name}`;
    } else if (node.property.type === 'PrivateIdentifier') {
      property = `#${node.property.name}`;
    } else {
      return;
    }

    const lhs = tryFindExternalChain(ctx, node.object);
    if (lhs) {
      return `${lhs}.${property}`;
    }
  }
}
