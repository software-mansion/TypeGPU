import type { Externals, JsNode } from './types.ts';

/**
 * Traverses ancestor chain and updates externals accordingly.
 * @example
 * addExternal(chainFrom`this.color.add`, {}); // { this: { color: { add: 'this.color.add' } } }
 * addExternal(chainFrom`this.color`, { this: { count: 'this.count' } }); // { this: { count: 'this.count', color: 'this.color' } }
 * addExternal(chainFrom`ext`, { ext: { count: 'ext.count' } }); // { ext: 'ext' }
 */
export function addExternal(ancestorChain: JsNode[], externals: Externals) {
  // TODO: clean up this mess
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
      chain.push(`${(current.property as { name: string }).name}`); // TODO: better handling of other nodes
    } else {
      break;
    }
  }

  let currentExternals = externals;
  if (typeof currentExternals !== 'object') {
    throw new Error('??');
  }
  for (const elem of chain) {
    let nextExternals = currentExternals[elem];
    if (nextExternals) {
      if (typeof nextExternals !== 'string') {
        currentExternals = nextExternals;
      } else {
        // we already need this in externals, so we break
        break;
      }
    } else {
      const newExt = Object.create(null);
      currentExternals[elem] = newExt;
      currentExternals = newExt;
    }
  }

  const lastKey = chain[chain.length - 1];
  if (lastKey !== undefined) {
    let parent = externals;
    for (const key of chain.slice(0, -1)) {
      const next = parent[key];
      if (!next || typeof next === 'string') break;
      parent = next;
    }
    if (typeof parent[lastKey] === 'object') {
      parent[lastKey] = chain.join('.');
    }
  }
}
