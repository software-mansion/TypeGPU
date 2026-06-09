import type { Externals, JsNode } from './types.ts';

/**
 * Returns an array of prop accesses.
 */
function extractPropAccessChain(ancestorChain: JsNode[]): string[] {
  const chain: string[] = [];
  for (let i = ancestorChain.length - 1; i >= 0; i--) {
    const current = ancestorChain[i];

    if (!current) {
      break;
    }

    if (current.type === 'Identifier') {
      chain.push(current.name);
    } else if (current.type === 'ThisExpression') {
      chain.push('this');
    } else if (current.type === 'MemberExpression' && !current.computed) {
      if (current.computed) {
        break;
      } else if (current.property.type === 'Identifier') {
        chain.push(current.property.name);
      } else {
        break;
      }
    } else {
      break;
    }
  }
  return chain;
}

/**
 * Traverses ancestor chain and updates externals accordingly.
 * @example
 * addExternal({}, chainFrom`this.color.add`); // { this: { color: { add: 'this.color.add' } } }
 * addExternal({ this: { count: 'this.count' } }, chainFrom`this.color`); // { this: { count: 'this.count', color: 'this.color' } }
 * addExternal({ ext: { count: 'ext.count' } }, chainFrom`ext`); // { ext: 'ext' }
 * addExternal({ ext: 'ext' }, chainFrom`ext.count`); // { ext: 'ext' }
 */
export function addExternal(externals: Externals, ancestorChain: JsNode[]) {
  const chain = extractPropAccessChain(ancestorChain);
  externals.push(chain.join('.'));
}
