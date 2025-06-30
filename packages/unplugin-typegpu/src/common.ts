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
  autoNamingEnabled: boolean;
};

export interface Options {
  include?: FilterPattern;
  exclude?: FilterPattern;
  enforce?: 'post' | 'pre' | undefined;
  forceTgpuAlias?: string;
  autoNamingEnabled?: boolean;
}

export const defaultOptions = {
  include: [/\.m?[jt]sx?$/],
  autoNamingEnabled: true,
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
      if (
        (tail.property.type === 'Literal' ||
          tail.property.type === 'StringLiteral') &&
        tail.property.value === '~unstable'
      ) {
        // Bypassing the '~unstable' property.
        tail = tail.object;
        continue;
      }

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
    node.callee.type === 'CallExpression' &&
    node.callee.callee.type === 'MemberExpression' &&
    node.callee.callee.property.type === 'Identifier' &&
    fnShellFunctionNames.includes(node.callee.callee.property.name) &&
    node.arguments.length === 1 && isTgpu(ctx, node.callee.callee.object)
  );
}

const resourceConstructors: string[] = [
  // tgpu
  'bindGroupLayout',
  'vertexLayout',
  // tgpu['~unstable']
  'slot',
  'accessor',
  'privateVar',
  'workgroupVar',
  'const',
  ...fnShellFunctionNames,
  // d
  'struct',
  'unstruct',
  // root
  'createBuffer',
  'createMutable',
  'createReadonly',
  'createUniform',
  // root['~unstable']
  'createPipeline',
  'createTexture',
  'sampler',
  'comparisonSampler',
];

/**
 * Checks if `node` should be wrapped in an autoname function.
 * Since it is mostly for debugging and clean WGSL generation,
 * some false positives and false negatives are admissible.
 */
export function containsResourceConstructorCall(
  node: acorn.AnyNode | babel.Node,
  ctx: Context,
) {
  if (node.type === 'CallExpression') {
    if (isShellImplementationCall(node, ctx)) {
      return true;
    }
    // struct({...})
    if (
      node.callee.type === 'Identifier' &&
      resourceConstructors.includes(node.callee.name)
    ) {
      return true;
    }
    if (node.callee.type === 'MemberExpression') {
      if (node.callee.property.type === 'Identifier') {
        // root.createBuffer({...})
        if (resourceConstructors.includes(node.callee.property.name)) {
          return true;
        }
        if (node.callee.property.name === '$name') {
          return false;
        }
      }
      // root.createBuffer(d.f32).$usage('storage')
      return containsResourceConstructorCall(node.callee.object, ctx);
    }
  }
  if (node.type === 'TaggedTemplateExpression') {
    return containsResourceConstructorCall(node.tag, ctx);
  }
  return false;
}

export const kernelDirectives = ['kernel', 'kernel & js'] as const;
export type KernelDirective = (typeof kernelDirectives)[number];

export function getErrorMessage(name: string | undefined) {
  return `The function "${
    name ?? '<unnamed>'
  }" is invokable only on the GPU. If you want to use it on the CPU, mark it with the "kernel & js" directive.`;
}
