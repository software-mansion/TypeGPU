import type { Context, JsNode } from './types.ts';

export function isDeclared(ctx: Context, name: string) {
  return ctx.stack.some((scope) => scope.declaredNames.includes(name));
}

// TODO: docs
// TODO: optimize with a map of failed lookups
export function tryFindExternalChain(ctx: Context, node: JsNode): string | undefined {
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
