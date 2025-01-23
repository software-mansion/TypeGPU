import type * as babel from '@babel/types';
import type * as acorn from 'acorn';

export const typegpuImportRegex = /import.*from\s*['"]typegpu.*['"]/g;
export const typegpuDynamicImportRegex = /import\s*\(\s*['"]\s*typegpu.*['"]/g;
export const typegpuRequireRegex = /require\s*\(\s*['"]\s*typegpu.*['"]\s*\)/g;

export type Context = {
  /**
   * How the `tgpu` object is used in code. Since it can be aliased, we
   * need to catch that and act accordingly.
   */
  tgpuAliases: Set<string>;
};

export function embedJSON(jsValue: unknown) {
  return JSON.stringify(jsValue)
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/**
 * Checks if `node` is an alias for the 'tgpu' object, traditionally
 * available via `import tgpu from 'typegpu'`.
 */
export function isTgpu(
  ctx: Context,
  node: babel.Node | acorn.AnyNode,
): boolean {
  let path = '';

  let tail = node;
  while (true) {
    if (tail.type === 'MemberExpression') {
      if (tail.property.type !== 'Identifier') {
        // Not handling computed expressions.
        break;
      }

      path = path ? `${tail.property.name}.${path}` : tail.property.name;
      tail = tail.object;
    } else if (tail.type === 'Identifier') {
      path = path ? `${tail.name}.${path}` : tail.name;
      break;
    } else {
      break;
    }
  }

  return ctx.tgpuAliases.has(path);
}

export interface TypegpuPluginOptions {
  include?: 'all' | RegExp[];
}
