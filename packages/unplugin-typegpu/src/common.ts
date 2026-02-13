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
  /** @default [/\.m?[jt]sx?$/] */
  include?: FilterPattern;

  /** @default undefined */
  exclude?: FilterPattern;

  /** @default undefined */
  enforce?: 'post' | 'pre' | undefined;

  /** @default undefined */
  forceTgpuAlias?: string | undefined;

  /** @default true */
  autoNamingEnabled?: boolean | undefined;

  /**
   * Skipping files that don't contain "typegpu", "tgpu" or "use gpu".
   * In case this early pruning hinders transformation, you
   * can disable it.
   *
   * @default true
   */
  earlyPruning?: boolean | undefined;
}

export const defaultOptions = {
  include: /\.m?[jt]sx?(?:\?.*)?$/,
  autoNamingEnabled: true,
  earlyPruning: true,
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

/**
 * Extracts a name and expression from nodes that contain a label and an expression,
 * such as VariableDeclarator or PropertyDefinition.
 * Returns a tuple of [name, expression] if found, otherwise undefined.
 *
 * @example
 * extractLabelledExpression(node`let name = tgpu.bindGroupLayout({});`)
 * // ["name", node`tgpu.bindGroupLayout({})`]
 */
function extractLabelledExpression<T extends acorn.AnyNode | babel.Node>(
  node: T,
): [string, ExpressionFor<T>] | undefined {
  if (
    node.type === 'VariableDeclarator' &&
    node.id.type === 'Identifier' &&
    node.init
  ) {
    // let id = init;
    return [node.id.name, node.init as ExpressionFor<T>];
  } else if (node.type === 'AssignmentExpression') {
    // left = right;
    const maybeName = tryFindIdentifier(node.left);
    if (maybeName) {
      return [maybeName, node.right as ExpressionFor<T>];
    }
  } else if (
    (node.type === 'Property' || node.type === 'ObjectProperty') &&
    node.key.type === 'Identifier'
  ) {
    // const a = { key: value }
    return [node.key.name, node.value as ExpressionFor<T>];
  } else if (
    (node.type === 'ClassProperty' || node.type === 'PropertyDefinition') &&
    node.value &&
    node.key.type === 'Identifier'
  ) {
    // class Class {
    //	 key = value;
    // }
    return [node.key.name, node.value as ExpressionFor<T>];
  }
}

export function getFunctionName(
  node: acorn.AnyNode | babel.Node,
  parent: acorn.AnyNode | babel.Node | null,
): string | undefined {
  const maybeName = parent ? extractLabelledExpression(parent)?.[0] : undefined;
  return maybeName ??
    (node.type === 'FunctionDeclaration' ||
        node.type === 'FunctionExpression'
      ? node.id?.name
      : undefined);
}

const resourceConstructors: string[] = [
  // tgpu
  'bindGroupLayout',
  'vertexLayout',
  'privateVar',
  'workgroupVar',
  'const',
  'slot',
  'accessor',
  'comptime',
  ...fnShellFunctionNames,
  // root
  'createBuffer',
  'createMutable',
  'createReadonly',
  'createUniform',
  'createQuerySet',
  'createPipeline',
  'createComputePipeline',
  'createGuardedComputePipeline',
  'createRenderPipeline',
  'createTexture',
  'createSampler',
  'createComparisonSampler',
  // d
  'struct',
  'unstruct',
  // other
  'createView',
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

/**
 * Tries to find an identifier in a node.
 *
 * @example
 * // syntax is simplified, imagine the arguments are appropriate nodes instead
 * tryFindIdentifier('myBuffer'); // 'myBuffer'
 * tryFindIdentifier('buffers.myBuffer'); // 'myBuffer'
 * tryFindIdentifier('this.myBuffer'); // 'myBuffer'
 * tryFindIdentifier('[a, b]'); // undefined
 */
function tryFindIdentifier(
  node: acorn.AnyNode | babel.Node,
): string | undefined {
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'PrivateName') {
    return tryFindIdentifier(node.id);
  }
  if (node.type === 'PrivateIdentifier') {
    return node.name;
  }
  if (node.type === 'MemberExpression') {
    return tryFindIdentifier(node.property);
  }
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
 * This function is NOT used for auto-naming shell-less functions.
 * Those are handled separately.
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

  const labelledExpression = extractLabelledExpression(node);
  if (labelledExpression) {
    const [label, expression] = labelledExpression;
    if (containsResourceConstructorCall(expression, ctx)) {
      namingCallback(expression, label);
    }
  }
}

export const useGpuDirective = 'use gpu';

/** Regular expressions used for early pruning (to avoid unnecessary parsing, which is expensive) */
export const earlyPruneRegex = [/["']use gpu["']/, /t(ype)?gpu/];

export const operators = {
  '+': '__tsover_add',
  '-': '__tsover_sub',
  '*': '__tsover_mul',
  '/': '__tsover_div',
  '+=': '__tsover_add',
  '-=': '__tsover_sub',
  '*=': '__tsover_mul',
  '/=': '__tsover_div',
};
