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
 * Traverses externals through the chain, and updates the last value with given string.
 * NOTE: to achieve better complexity, chain is expected to be passed in reversed (e.g. ['mul', 'prop', 'ext']), and it will be mutated.
 */
function addExternalValue(externals: Externals, chain: string[], value: string) {
  const elem = chain.pop();
  if (elem === undefined) {
    throw new Error('Internal error, expected element to be defined.');
  }

  if (chain.length === 0) {
    externals[elem] = value;
    return;
  }

  const nextExternals = externals[elem];
  if (nextExternals) {
    if (typeof nextExternals !== 'string') {
      addExternalValue(nextExternals, chain, value);
    } else {
      // we already need this in externals, so we break
      return;
    }
  } else {
    const newExternals = Object.create(null);
    externals[elem] = newExternals;
    return addExternalValue(newExternals, chain, value);
  }
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
  addExternalValue(externals, chain.toReversed(), chain.join('.'));
}
