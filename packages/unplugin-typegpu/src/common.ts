import type * as babel from '@babel/types';
import type * as acorn from 'acorn';
import type { FilterPattern } from 'unplugin';

export type Context = {
  /**
   * How the `tgpu` object is used in code. Since it can be aliased, we
   * need to catch that and act accordingly.
   */
  tgpuAliases: Set<string>;
  fileId?: string | undefined;
};

export interface Options {
  include?: FilterPattern;
  exclude?: FilterPattern;
  enforce?: 'post' | 'pre' | undefined;
  forceTgpuAlias?: string;
}

export const defaultOptions = {
  include: [/\.m?[jt]sx?$/],
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
function isTgpu(ctx: Context, node: babel.Node | acorn.AnyNode): boolean {
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

export function gatherTgpuAliases(
  node: acorn.ImportDeclaration | babel.ImportDeclaration,
  ctx: Context,
) {
  if (node.source.value === 'typegpu') {
    for (const spec of node.specifiers) {
      if (
        // The default export of 'typegpu' is the `tgpu` object.
        spec.type === 'ImportDefaultSpecifier' ||
        // Aliasing 'tgpu' while importing, e.g. import { tgpu as t } from 'typegpu';
        (spec.type === 'ImportSpecifier' &&
          spec.imported.type === 'Identifier' &&
          spec.imported.name === 'tgpu')
      ) {
        ctx.tgpuAliases.add(spec.local.name);
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        // Importing everything, e.g. import * as t from 'typegpu';
        ctx.tgpuAliases.add(`${spec.local.name}.tgpu`);
      }
    }
  }
}

const fnShellFunctionNames = ['fn', 'vertexFn', 'fragmentFn', 'computeFn'];

export function isShellImplementationCall(
  node: acorn.CallExpression | babel.CallExpression,
  ctx: Context,
) {
  return (
    (node.callee.type === 'CallExpression' &&
      node.callee.callee.type === 'MemberExpression' &&
      node.callee.callee.property.type === 'Identifier' &&
      fnShellFunctionNames.includes(node.callee.callee.property.name) &&
      node.arguments.length === 1 &&
      (node.callee.callee.object.type === 'MemberExpression'
        ? isTgpu(ctx, node.callee.callee.object.object)
        : isTgpu(ctx, node.callee.callee.object))) || // TODO: remove along with the deprecated 'does' method
    (node.callee.type === 'MemberExpression' &&
      node.arguments.length === 1 &&
      node.callee.property.type === 'Identifier' &&
      // Assuming that every call to `.does` is related to TypeGPU
      // because shells can be created separately from calls to `tgpu`,
      // making it hard to detect.
      node.callee.property.name === 'does')
  );
}

export const kernelDirectives = ['kernel', 'kernel & js'] as const;
export type KernelDirective = (typeof kernelDirectives)[number];
