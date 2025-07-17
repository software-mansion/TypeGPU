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
  'createQuerySet',
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
function containsResourceConstructorCall(
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

type ExpressionFor<T extends acorn.AnyNode | babel.Node> = T extends
  acorn.AnyNode ? acorn.Expression : babel.Expression;

/**
 * Checks if `node` contains a label and a tgpu expression that could be named.
 * If so, it calls the provided callback. Nodes selected for naming include:
 *
 * `let name = tgpu.bindGroupLayout({});` (VariableDeclarator)
 *
 * `name = tgpu.bindGroupLayout({});` (AssignmentExpression)
 *
 * `property: tgpu.bindGroupLayout({})` (Property/ObjectProperty)
 *
 * Since it is mostly for debugging and clean WGSL generation,
 * some false positives and false negatives are admissible.
 *
 * @privateRemarks
 * When adding new checks, you need to call this method in the corresponding node in Babel.
 */
export function performExpressionNaming<T extends acorn.AnyNode | babel.Node>(
  ctx: Context,
  node: T,
  namingCallback: (node: ExpressionFor<T>, name: string) => void,
) {
  if (!ctx.autoNamingEnabled) {
    return;
  }

  if (
    node.type === 'VariableDeclarator' &&
    node.id.type === 'Identifier' &&
    node.init &&
    containsResourceConstructorCall(node.init, ctx)
  ) {
    namingCallback(node.init as ExpressionFor<T>, node.id.name);
  } else if (
    node.type === 'AssignmentExpression' &&
    node.left.type === 'Identifier' &&
    containsResourceConstructorCall(node.right, ctx)
  ) {
    namingCallback(node.right as ExpressionFor<T>, node.left.name);
  } else if (
    (node.type === 'Property' || node.type === 'ObjectProperty') &&
    node.key.type === 'Identifier' &&
    containsResourceConstructorCall(node.value, ctx)
  ) {
    namingCallback(node.value as ExpressionFor<T>, node.key.name);
  }
}

export const kernelDirective = 'kernel';
