import * as acorn from 'acorn';
import * as babel from '@babel/types';
import type { Context, JsNode } from './types.ts';

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

function isDeclared(ctx: Context, name: string) {
  return ctx.stack.some((scope) => scope.declaredNames.includes(name));
}

type PrivateNameGetter<TMemberExpression> = (node: TMemberExpression) => string | undefined;

type ExternalChainFinder<TNode> = (ctx: Context, node: TNode) => string | undefined;

function createExternalChainFinder(
  getPrivatePropertyName: PrivateNameGetter<acorn.MemberExpression>,
): ExternalChainFinder<acorn.AnyNode>;
function createExternalChainFinder(
  getPrivatePropertyName: PrivateNameGetter<babel.MemberExpression>,
): ExternalChainFinder<babel.Node>;
function createExternalChainFinder(
  getPrivatePropertyName:
    | PrivateNameGetter<acorn.MemberExpression>
    | PrivateNameGetter<babel.MemberExpression>,
) {
  const find: ExternalChainFinder<JsNode> = (ctx, node) => {
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

      const property =
        node.property.type === 'Identifier' && node.property.name !== '$'
          ? node.property.name
          : (
              getPrivatePropertyName as PrivateNameGetter<
                acorn.MemberExpression | babel.MemberExpression
              >
            )(node);

      if (!property) {
        return;
      }

      const lhs = find(ctx, node.object);
      if (lhs) {
        return `${lhs}.${property}`;
      }
    }
  };

  return find;
}

function getPrivatePropertyNameAcorn(node: acorn.MemberExpression): string | undefined {
  return node.property.type === 'PrivateIdentifier' ? `#${node.property.name}` : undefined;
}

function getPrivatePropertyNameBabel(node: babel.MemberExpression): string | undefined {
  return node.property.type === 'PrivateName' ? `#${node.property.id.name}` : undefined;
}

/**
 * Checks if the provided node is an external chain access.
 * @example
 * tryFindExternalChainAcorn(ctx, node`ext`); // 'ext'
 * tryFindExternalChainAcorn(ctx, node`ext.p.q`); // 'ext.p.q'
 * tryFindExternalChainAcorn(ctx, node`ext.p.q().r`); // undefined
 * tryFindExternalChainAcorn(ctx, node`local.p.q`); // undefined
 * tryFindExternalChainAcorn(ctx, node`ext.$.q`); // undefined
 */
export const tryFindExternalChainAcorn = createExternalChainFinder(getPrivatePropertyNameAcorn);

/**
 * Checks if the provided node is an external chain access.
 * @example
 * tryFindExternalChainBabel(ctx, node`ext`); // 'ext'
 * tryFindExternalChainBabel(ctx, node`ext.p.q`); // 'ext.p.q'
 * tryFindExternalChainBabel(ctx, node`ext.p.q().r`); // undefined
 * tryFindExternalChainBabel(ctx, node`local.p.q`); // undefined
 * tryFindExternalChainBabel(ctx, node`ext.$.q`); // undefined
 */
export const tryFindExternalChainBabel = createExternalChainFinder(getPrivatePropertyNameBabel);
