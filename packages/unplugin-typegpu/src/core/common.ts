import * as t from '@babel/types';
import type { NodePath, TraverseOptions } from '@babel/traverse';
import type { FilterPattern } from 'unplugin';
import { MagicStringAST } from 'magic-string-ast';
import { transpileFn } from 'tinyest-for-wgsl';

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

export type MetadatableFunction =
  | t.FunctionDeclaration
  | t.FunctionExpression
  | t.ArrowFunctionExpression;

export interface TransformMethods {
  warn(message: string): void;

  /**
   * For function statements to have metadata assigned, they first have to be manually hoisted
   * to the top of their scope, then replaced with a variable declaration.
   *
   * @example
   * ```ts
   * const value = mod(13, 10);
   * function mod(a: number, b: number): number {
   *   'use gpu';
   *   return a % b;
   * }
   * ```
   *
   * Should be transformed to:
   *
   * ```ts
   * const mod = (a: number, b: number): number => {
   *   'use gpu';
   *   return a % b;
   * };
   * const value = mod(13, 10);
   * ```
   *
   * Note that named function expressions aren't hoisted, so they don't pose a problem.
   * ```ts
   * double(2); // Uncaught ReferenceError: double is not defined
   * console.log(function double(a) { return a * 2; });
   * ```
   */
  assignMetadata(
    this: PluginState,
    path: NodePath<MetadatableFunction>,
    name: string | undefined,
    ast: ReturnType<typeof transpileFn>,
  ): void;

  wrapInAutoName(this: PluginState, path: NodePath<t.Expression>, name: string): void;

  replaceWithAssignmentOverload(path: NodePath<t.AssignmentExpression>, runtimeFn: string): void;

  replaceWithBinaryOverload(path: NodePath<t.BinaryExpression>, runtimeFn: string): void;
}

export interface PluginState extends TransformMethods {
  /**
   * How the `tgpu` object is used in code. Since it can be aliased, we
   * need to catch that and act accordingly.
   */
  tgpuAliases: Set<string>;
  autoNamingEnabled: boolean;

  /**
   * Populated by Babel
   */
  filename?: string | undefined;

  /**
   * In Babel, options are assigned to the property `opts` on the plugin state.
   * We use this pattern everywhere for consistency.
   */
  opts: Options;

  inUseGpuScope: boolean;

  alreadyTransformed: WeakSet<t.Node>;
}

export interface UnpluginPluginState extends PluginState {
  magicString: MagicStringAST;
}

export function initPluginState(state: PluginState, methods: TransformMethods): void {
  state.tgpuAliases = new Set<string>(state.opts.forceTgpuAlias ? [state.opts.forceTgpuAlias] : []);
  state.autoNamingEnabled = state.opts.autoNamingEnabled ?? true;
  state.inUseGpuScope = false;
  state.alreadyTransformed = new WeakSet<t.Node>();
  Object.assign(state, methods);
}

/** Regular expressions used for early pruning (to avoid unnecessary parsing, which is expensive) */
export const earlyPruneRegex = [/["']use gpu["']/, /t(ype)?gpu/];

export const defaultOptions = {
  include: /\.m?[jt]sx?(?:\?.*)?$/,
  autoNamingEnabled: true,
  earlyPruning: true,
};

/**
 * Returns the block scope of a function declaration, if one exists.
 * Used to hoist a function declaration to the top of the scope it's visible in.
 */
export function getBlockScope(
  path: NodePath<t.FunctionDeclaration>,
): NodePath<t.BlockStatement | t.Program> | undefined {
  if (!path.node.id) {
    // Anonymous function statement, no visiblility
    return undefined;
  }

  const binding = path.scope.getBinding(path.node.id.name);
  if (!binding) {
    // Not bound anywhere, we can skip
    return undefined;
  }

  let scopePath = binding.scope.path;

  // If the block doesn't have an array of statements for a body (e.g. FunctionDeclaration), delve deeper
  if (t.isNode((scopePath.node as t.FunctionDeclaration).body)) {
    scopePath = scopePath.get('body') as NodePath;
  }

  if (t.isBlockStatement(scopePath.node) || t.isProgram(scopePath.node)) {
    return scopePath as NodePath<t.BlockStatement | t.Program>;
  }

  // We give up. This is most likely a switch statement. The fallback will just not
  // hoist the function, so it should still work in most cases.
  return undefined;
}

/**
 * Checks if `node` is an alias for the 'tgpu' object, traditionally
 * available via `import tgpu from 'typegpu'`.
 */
function isTgpu(state: PluginState, node: t.Node): boolean {
  let path = '';

  let tail = node;
  while (true) {
    if (tail.type === 'MemberExpression') {
      if (tail.property.type === 'StringLiteral' && tail.property.value === '~unstable') {
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

  return state.tgpuAliases.has(path);
}

function gatherTgpuAliases(state: PluginState, node: t.ImportDeclaration) {
  if (node.source.value !== 'typegpu') {
    return;
  }

  for (const spec of node.specifiers) {
    if (
      // The default export of 'typegpu' is the `tgpu` object.
      spec.type === 'ImportDefaultSpecifier' ||
      // Aliasing 'tgpu' while importing, e.g. import { tgpu as t } from 'typegpu';
      (spec.type === 'ImportSpecifier' &&
        spec.imported.type === 'Identifier' &&
        spec.imported.name === 'tgpu')
    ) {
      state.tgpuAliases.add(spec.local.name);
    } else if (spec.type === 'ImportNamespaceSpecifier') {
      // Importing everything, e.g. import * as t from 'typegpu';
      state.tgpuAliases.add(`${spec.local.name}.tgpu`);
    }
  }
}

const fnShellFunctionNames = ['fn', 'vertexFn', 'fragmentFn', 'computeFn'];

function isShellImplementationCall(node: t.CallExpression, state: PluginState) {
  return (
    node.callee.type === 'CallExpression' &&
    node.callee.callee.type === 'MemberExpression' &&
    node.callee.callee.property.type === 'Identifier' &&
    fnShellFunctionNames.includes(node.callee.callee.property.name) &&
    node.arguments.length === 1 &&
    isTgpu(state, node.callee.callee.object)
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
function extractLabelledExpression(path: NodePath): [string, NodePath<t.Expression>] | undefined {
  if (
    path.node.type === 'VariableDeclarator' &&
    path.node.id.type === 'Identifier' &&
    path.node.init
  ) {
    // let id = init;
    return [path.node.id.name, path.get('init') as NodePath<t.Expression>];
  } else if (path.node.type === 'AssignmentExpression') {
    // left = right;
    const maybeName = tryFindIdentifier(path.node.left);
    if (maybeName) {
      return [maybeName, path.get('right') as NodePath<t.Expression>];
    }
  } else if (path.node.type === 'ObjectProperty' && path.node.key.type === 'Identifier') {
    // const a = { key: value }
    return [path.node.key.name, path.get('value') as NodePath<t.Expression>];
  } else if (
    path.node.type === 'ClassProperty' &&
    path.node.value &&
    path.node.key.type === 'Identifier'
  ) {
    // class Class {
    //	 key = value;
    // }
    return [path.node.key.name, path.get('value') as NodePath<t.Expression>];
  }
}

function getFunctionName(path: NodePath): string | undefined {
  const maybeName = path.parentPath ? extractLabelledExpression(path.parentPath)?.[0] : undefined;
  return (
    maybeName ??
    (path.node.type === 'FunctionDeclaration' || path.node.type === 'FunctionExpression'
      ? path.node.id?.name
      : undefined)
  );
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
  'mutableAccessor',
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
function containsResourceConstructorCall(node: t.Node, state: PluginState) {
  if (node.type === 'CallExpression') {
    if (isShellImplementationCall(node, state)) {
      return true;
    }
    // struct({...})
    if (node.callee.type === 'Identifier' && resourceConstructors.includes(node.callee.name)) {
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
      return containsResourceConstructorCall(node.callee.object, state);
    }
  }
  if (node.type === 'TaggedTemplateExpression') {
    return containsResourceConstructorCall(node.tag, state);
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
function tryFindIdentifier(node: t.Node): string | undefined {
  if (node.type === 'Identifier') {
    return node.name;
  }
  if (node.type === 'PrivateName') {
    return tryFindIdentifier(node.id);
  }
  if (node.type === 'MemberExpression') {
    return tryFindIdentifier(node.property);
  }
}

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
function performExpressionNaming(
  state: PluginState,
  path: NodePath,
  namingCallback: (node: NodePath<t.Expression>, name: string) => void,
) {
  if (!state.autoNamingEnabled) {
    return;
  }

  const labelledExpression = extractLabelledExpression(path);
  if (labelledExpression) {
    const [label, expressionPath] = labelledExpression;
    if (containsResourceConstructorCall(expressionPath.node, state)) {
      namingCallback(expressionPath, label);
    }
  }
}

const operators = {
  '+': '__tsover_add',
  '-': '__tsover_sub',
  '*': '__tsover_mul',
  '/': '__tsover_div',
  '%': '__tsover_mod',
  '+=': '__tsover_add',
  '-=': '__tsover_sub',
  '*=': '__tsover_mul',
  '/=': '__tsover_div',
  '%=': '__tsover_mod',
};

function containsUseGpuDirective(
  node: t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression,
): boolean {
  return ('directives' in node.body ? (node.body?.directives ?? []) : [])
    .map((directive) => directive.value.value)
    .includes('use gpu');
}

const fnNodeToTranspiledMap = new WeakMap<
  t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression,
  ReturnType<typeof transpileFn>
>();

function functionOnExit(
  path: NodePath<t.FunctionDeclaration | t.FunctionExpression | t.ArrowFunctionExpression>,
  state: PluginState,
) {
  const node = path.node;
  if (!containsUseGpuDirective(node)) {
    return;
  }

  state.inUseGpuScope = false;

  if (state.alreadyTransformed.has(node)) {
    return;
  }

  const ast = fnNodeToTranspiledMap.get(path.node);
  const maybeName = getFunctionName(path);
  if (!ast) {
    throw new Error(`No metadata found for function ${maybeName ?? '<unnamed>'}`);
  }
  state.assignMetadata(path, maybeName, ast);
  state.alreadyTransformed.add(node);
  path.skip();
}

export const functionVisitor: TraverseOptions<PluginState> = {
  ImportDeclaration(path, state) {
    gatherTgpuAliases(state, path.node);
  },

  VariableDeclarator(path, state) {
    performExpressionNaming(state, path, (pathToName, name) => {
      state.wrapInAutoName(pathToName, name);
    });
  },

  ObjectProperty(path, state) {
    performExpressionNaming(state, path, (pathToName, name) =>
      state.wrapInAutoName(pathToName, name),
    );
  },

  ClassProperty(path, state) {
    performExpressionNaming(state, path, (pathToName, name) =>
      state.wrapInAutoName(pathToName, name),
    );
  },

  AssignmentExpression: {
    exit(path, state) {
      const runtimeFn = operators[path.node.operator as keyof typeof operators];
      if (state.inUseGpuScope && runtimeFn) {
        state.replaceWithAssignmentOverload(path, runtimeFn);
      }

      performExpressionNaming(state, path, (pathToName, name) =>
        state.wrapInAutoName(pathToName, name),
      );

      path.skip();
    },
  },

  BinaryExpression: {
    exit(path, state) {
      const runtimeFn = operators[path.node.operator as keyof typeof operators];
      if (state.inUseGpuScope && runtimeFn) {
        state.replaceWithBinaryOverload(path, runtimeFn);
      }

      path.skip();
    },
  },

  ArrowFunctionExpression: {
    enter(path, state) {
      if (containsUseGpuDirective(path.node)) {
        fnNodeToTranspiledMap.set(path.node, transpileFn(path.node));
        if (state.inUseGpuScope) {
          throw new Error(`Nesting 'use gpu' functions is not allowed`);
        }
        state.inUseGpuScope = true;
      }
    },
    exit: functionOnExit,
  },

  FunctionExpression: {
    enter(path, state) {
      if (containsUseGpuDirective(path.node)) {
        fnNodeToTranspiledMap.set(path.node, transpileFn(path.node));
        if (state.inUseGpuScope) {
          throw new Error(`Nesting 'use gpu' functions is not allowed`);
        }
        state.inUseGpuScope = true;
      }
    },
    exit: functionOnExit,
  },

  FunctionDeclaration: {
    enter(path, state) {
      if (containsUseGpuDirective(path.node)) {
        fnNodeToTranspiledMap.set(path.node, transpileFn(path.node));
        if (state.inUseGpuScope) {
          throw new Error(`Nesting 'use gpu' functions is not allowed`);
        }
        state.inUseGpuScope = true;
      }
    },
    exit: functionOnExit,
  },

  CallExpression: {
    exit(path, state) {
      const node = path.node;

      if (isShellImplementationCall(node, state)) {
        const implementation = node.arguments[0];

        if (
          implementation &&
          // If it contains a 'use gpu' directive, it has already been transpiled
          (implementation.type === 'FunctionExpression' ||
            implementation.type === 'ArrowFunctionExpression') &&
          !containsUseGpuDirective(implementation)
        ) {
          state.assignMetadata(
            path.get('arguments.0') as NodePath<
              t.ArrowFunctionExpression | t.FunctionDeclaration | t.FunctionExpression
            >,
            getFunctionName(path.get('arguments.0')),
            transpileFn(implementation),
          );
        }
      }
    },
  },
};
