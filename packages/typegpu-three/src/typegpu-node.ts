import type NodeFunction from 'three/src/nodes/core/NodeFunction.js';
import type NodeVarying from 'three/src/nodes/core/NodeVarying.js';
import type VaryingNode from 'three/src/nodes/core/VaryingNode.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { tgpu, d, type Namespace, type TgpuVar, type ResolvedDeclaration } from 'typegpu';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
import { glOptions } from '@typegpu/gl';

/**
 * State held by the node, used during shader generation.
 */
interface TgpuFnNodeData extends THREE.NodeData {
  custom: {
    nodeFunction: NodeFunction;
    priorCode: THREE.Node;
    functionId: string;
    dependencies: TSLAccessor<d.AnyWgslData, THREE.Node>[];
  };
}

abstract class StageData {
  declare readonly type: 'setup' | 'analyze' | 'generate';
  readonly stage: 'vertex' | 'fragment' | 'compute' | null;
  readonly namespace: Namespace;

  constructor(stage: 'vertex' | 'fragment' | 'compute' | null) {
    this.stage = stage;
    this.namespace = tgpu['~unstable'].namespace();
  }
}

class GenerateStageData extends StageData {
  readonly type = 'generate';
  /**
   * Keeping track of all declarations resolved by a
   * specific builder, this helps to find the declaration
   * of a function that might have been previously used
   * transitively, but then is passed directly into toTSL
   */
  existingDeclarations: ResolvedDeclaration[];

  constructor(stage: 'vertex' | 'fragment' | 'compute' | null) {
    super(stage);
    this.existingDeclarations = [];
  }
}

class AnalyzeStageData extends StageData {
  readonly type = 'analyze';
}

class SetupStageData extends StageData {
  readonly type = 'setup';
}

class BuilderData {
  generateStageDataMap: Map<'vertex' | 'fragment' | 'compute' | null, GenerateStageData>;
  analyzeStageDataMap: Map<'vertex' | 'fragment' | 'compute' | null, AnalyzeStageData>;
  setupStageDataMap: Map<'vertex' | 'fragment' | 'compute' | null, SetupStageData>;

  constructor() {
    this.generateStageDataMap = new Map();
    this.analyzeStageDataMap = new Map();
    this.setupStageDataMap = new Map();
  }

  getGenerateStageData(stage: 'vertex' | 'fragment' | 'compute' | null): GenerateStageData {
    let stageData = this.generateStageDataMap.get(stage);
    if (!stageData) {
      stageData = new GenerateStageData(stage);
      this.generateStageDataMap.set(stage, stageData);
    }
    return stageData;
  }

  getAnalyzeStageData(stage: 'vertex' | 'fragment' | 'compute' | null): AnalyzeStageData {
    let stageData = this.analyzeStageDataMap.get(stage);
    if (!stageData) {
      stageData = new AnalyzeStageData(stage);
      this.analyzeStageDataMap.set(stage, stageData);
    }
    return stageData;
  }

  getSetupStageData(stage: 'vertex' | 'fragment' | 'compute' | null): SetupStageData {
    let stageData = this.setupStageDataMap.get(stage);
    if (!stageData) {
      stageData = new SetupStageData(stage);
      this.setupStageDataMap.set(stage, stageData);
    }
    return stageData;
  }
}

const builderDataMap = new WeakMap<THREE.NodeBuilder, BuilderData>();

function isVaryingNode(node: THREE.Node): node is VaryingNode {
  return (node as { isVaryingNode?: boolean }).isVaryingNode === true;
}

/**
 * Returns the private variable used to pass a TSL value into a TypeGPU function.
 *
 * Interpolated vertex outputs are the exception: WGSLNodeBuilder exposes them
 * through its module-scoped `varyings` value, so TypeGPU can reference them
 * directly. Fragment inputs and non-interpolated varyings are local to Three's
 * entry function and still need the bridge variable.
 */
function getBridgeVar<T extends d.AnyWgslData, TNode extends THREE.Node>(
  accessor: TSLAccessor<T, TNode>,
  builder: THREE.NodeBuilder,
): TgpuVar<'private', T> | undefined {
  const variable = accessor.var;

  if (variable && builder.shaderStage === 'vertex' && isVaryingNode(accessor.node)) {
    const properties = builder.getNodeProperties(accessor.node) as {
      varying?: NodeVarying;
    };

    if (properties.varying?.needsInterpolation) {
      return undefined;
    }
  }

  return variable;
}

interface TgpuFnNodeContext {
  readonly builder: THREE.NodeBuilder;
  readonly stageData: StageData;
  readonly dependencies: TSLAccessor<d.AnyWgslData, THREE.Node>[];
}

let currentlyGeneratingFnNodeCtx: TgpuFnNodeContext | undefined;

function withGeneratingFnNodeCtx<T>(ctx: TgpuFnNodeContext, callback: () => T): T {
  const previous = currentlyGeneratingFnNodeCtx;
  currentlyGeneratingFnNodeCtx = ctx;
  try {
    return callback();
  } finally {
    currentlyGeneratingFnNodeCtx = previous;
  }
}

function forceExplicitVoidReturn(codeIn: string) {
  if (codeIn.includes('->')) {
    // Has return type, so we don't need to force it
    return codeIn;
  }

  const closingParen = codeIn.indexOf(')');
  if (closingParen === -1) {
    throw new Error('Invalid code: missing closing parenthesis');
  }

  return codeIn.substring(0, closingParen + 1) + '-> void' + codeIn.substring(closingParen + 1);
}

function isWebGL(builder: THREE.NodeBuilder): boolean {
  const backend = builder.renderer?.backend;
  return (backend as { isWebGLBackend?: boolean } | undefined)?.isWebGLBackend === true;
}

class TgpuFnNode<T> extends THREE.Node {
  #impl: () => T;

  constructor(impl: () => T) {
    super('typegpu-fn-node');
    this.#impl = impl;

    // TODO: Figure out what this does. Apparently it's used for global cache,
    // but I don't know the ramifications of that. The CodeNode sets this to true too.
    this.global = true;
  }

  static get type() {
    return 'TgpuFnNode';
  }

  getNodeType(builder: THREE.NodeBuilder) {
    return this.#getNodeFunction(builder).type;
  }

  #getNodeFunction(builder: THREE.NodeBuilder) {
    const webgl = isWebGL(builder);
    const nodeData = builder.getDataFromNode(this) as TgpuFnNodeData;
    let builderData = builderDataMap.get(builder);

    if (!builderData) {
      builderData = new BuilderData();
      builderDataMap.set(builder, builderData);
    }

    const stageData = builderData.getGenerateStageData(builder.shaderStage);

    if (!nodeData.custom) {
      const ctx: TgpuFnNodeContext = {
        builder,
        stageData,
        dependencies: [],
      };

      const resolved = withGeneratingFnNodeCtx(ctx, () => {
        const { code, declarations } = tgpu.resolveWithContext([this.#impl], {
          names: stageData.namespace,
          ...(webgl ? glOptions() : {}),
        });

        // Resolving this.#impl as second time in the same
        // namespace resolved to only its identifier
        const functionId = tgpu.resolve({
          names: stageData.namespace,
          template: 'impl',
          externals: { impl: this.#impl },
          ...(webgl ? glOptions() : {}),
        });

        return {
          code,
          declarations,
          functionId,
        };
      });

      stageData.existingDeclarations.push(...resolved.declarations);

      // Extracting the function code
      const fnDeclaration = stageData.existingDeclarations.find(
        (decl) => decl.name === resolved.functionId,
      )?.code;

      if (!fnDeclaration) {
        throw new Error(
          `[@typegpu/three] Internal error, function declaration wasn't found in the generated shader code.`,
        );
      }

      nodeData.custom = {
        functionId: resolved.functionId,
        nodeFunction: builder.parser.parseFunction(
          // TODO: Upstream a fix to Three.js that accepts functions with no return type
          webgl ? fnDeclaration : forceExplicitVoidReturn(fnDeclaration),
        ),
        // Including code that was resolved before the function as another node
        // that this node depends on
        priorCode: TSL.code(resolved.code),
        dependencies: ctx.dependencies,
      };
    }

    return nodeData.custom.nodeFunction;
  }

  #analyzeFunction(builder: THREE.NodeBuilder) {
    const webgl = isWebGL(builder);
    let builderData = builderDataMap.get(builder);

    if (!builderData) {
      builderData = new BuilderData();
      builderDataMap.set(builder, builderData);
    }

    const stageData = builderData.getAnalyzeStageData(builder.shaderStage);

    const ctx: TgpuFnNodeContext = {
      builder,
      stageData,
      dependencies: [],
    };

    withGeneratingFnNodeCtx(ctx, () =>
      tgpu.resolve({
        names: stageData.namespace,
        template: 'impl',
        externals: { impl: this.#impl },
        ...(webgl ? glOptions() : {}),
      }),
    );
  }

  /**
   * Replicating Three.js `analyze` traversal.
   * Setting `needsInterpolation` flag to true in varying nodes
   */
  analyze(builder: THREE.NodeBuilder, output?: THREE.Node | null) {
    super.analyze(builder, output);
    this.#analyzeFunction(builder); // making sure it will find all TSL accessors
  }

  generate(
    builder: THREE.NodeBuilder,
    output: string | null | undefined,
  ): string | null | undefined {
    const webgl = isWebGL(builder);
    this.#getNodeFunction(builder); // making sure the node function exists

    const nodeData = builder.getDataFromNode(this) as TgpuFnNodeData;
    const builderData = builderDataMap.get(builder) as BuilderData;
    const stageData = builderData.getGenerateStageData(builder.shaderStage);

    // Building dependencies
    const uniqueDeps = [...new Set(nodeData.custom.dependencies)];
    for (const dep of uniqueDeps) {
      dep.node.build(builder);
    }
    nodeData.custom.priorCode.build(builder);

    for (const dep of uniqueDeps) {
      const bridgeVar = getBridgeVar(dep, builder);
      if (!bridgeVar) {
        continue;
      }

      const varValue = dep.node.build(builder);

      const code = tgpu.resolve({
        names: stageData.namespace,
        // oxlint-disable-next-line typescript/no-base-to-string
        template: `$var$ = ${varValue};\n`,
        externals: { $var$: bridgeVar },
        ...(webgl ? glOptions() : {}),
      });

      // @ts-expect-error: it's there
      builder.addLineFlowCode(code, this);
    }

    return output === 'property' ? nodeData.custom.functionId : `${nodeData.custom.functionId}()`;
  }
}

export function toTSL(fn: () => unknown): THREE.TSL.NodeObject<THREE.Node> {
  return TSL.nodeObject(new TgpuFnNode(fn));
}

export class TSLAccessor<T extends d.AnyWgslData, TNode extends THREE.Node> {
  readonly #dataType: T;

  readonly #var: TgpuVar<'private', T> | undefined;
  readonly node: THREE.TSL.NodeObject<TNode>;

  constructor(node: THREE.TSL.NodeObject<TNode>, dataType: T) {
    this.node = node;
    this.#dataType = dataType;

    if (
      // @ts-expect-error: they are assigned at runtime
      (!node.isStorageBufferNode && !node.isUniformNode) ||
      // @ts-expect-error: it is assigned at runtime
      node.isTextureNode
    ) {
      this.#var = tgpu.privateVar(dataType);
    }
  }

  get var(): TgpuVar<'private', T> | undefined {
    return this.#var;
  }

  get $(): d.InferGPU<T> {
    const ctx = currentlyGeneratingFnNodeCtx;

    if (!ctx) {
      throw new Error('Can only access TSL nodes on the GPU.');
    }

    if (ctx.stageData.type === 'analyze') {
      this.node.traverse((node: THREE.Node) => {
        node.analyze(ctx.builder);
      });
      // dummy return, only for types to match
      return tgpu['~unstable'].rawCodeSnippet('', this.#dataType, 'runtime').$;
    }

    // oxlint-disable-next-line typescript/no-explicit-any -- smh
    ctx.dependencies.push(this as any);

    const builtNode = this.node.build(ctx.builder) as string;
    const bridgeVar = getBridgeVar(this, ctx.builder);

    if (bridgeVar) {
      return bridgeVar.$;
    }

    return tgpu['~unstable'].rawCodeSnippet(builtNode, this.#dataType).$;
  }
}

const typeMap = {
  f: 'f32',
  h: 'f16',
  i: 'i32',
  u: 'u32',
  b: 'bool',
} as const;

/**
 * Maps short type identifiers to their explicit WGSL type names.
 *
 * @example
 * convertTypeToExplicit('vec3f'); // 'vec3<f32>'
 */
function convertTypeToExplicit(type: string) {
  if (type.startsWith('vec') && type.indexOf('<') === -1) {
    const itemCount = type.charAt(3);
    const itemType = typeMap[type.charAt(4) as keyof typeof typeMap];
    return `vec${itemCount}<${itemType}>`;
  }
  if (type.startsWith('mat') && type.indexOf('<') === -1) {
    const itemCount = type.charAt(3);
    const itemType = typeMap[type.charAt(6) as keyof typeof typeMap];
    return `mat${itemCount}x${itemCount}<${itemType}>`;
  }
  return type;
}

let sharedBuilder: WGSLNodeBuilder | undefined;

type FromTSL = (<T extends d.AnyWgslData, TNode extends THREE.Node>(
  node: THREE.TSL.NodeObject<TNode>,
  type: (length: number) => T,
) => TSLAccessor<T, TNode>) &
  (<T extends d.AnyWgslData, TNode extends THREE.Node>(
    node: THREE.TSL.NodeObject<TNode>,
    type: T,
  ) => TSLAccessor<T, TNode>);

export const fromTSL = tgpu.comptime(((node, type) => {
  const tgpuType = d.isData(type) ? type : (type as (length: number) => d.AnyWgslData)(0);

  // In THREE, the type of array buffers equals to the type of the element.
  const wgslTypeFromTgpu = convertTypeToExplicit(
    d.isWgslArray(tgpuType) ? tgpuType.elementType.type : tgpuType.type,
  );

  if (!sharedBuilder) {
    sharedBuilder = new WGSLNodeBuilder();
  }
  let nodeType: string | null = null;
  try {
    // sometimes it needs information (overrideNodes) from compilation context which is not present
    nodeType = node.getNodeType(sharedBuilder);
  } catch {
    console.warn(`fromTSL: failed to infer node type via getNodeType; skipping type comparison.`);
  }

  if (nodeType) {
    const wgslTypeFromTSL = sharedBuilder.getType(nodeType);
    if (wgslTypeFromTSL !== wgslTypeFromTgpu) {
      const vec4warn = wgslTypeFromTSL.startsWith('vec4')
        ? ' Sometimes three.js promotes elements in arrays to align to 16 bytes.'
        : '';

      console.warn(
        `Suspected type mismatch between TSL type '${wgslTypeFromTSL}' (originally '${nodeType}') and TypeGPU type '${wgslTypeFromTgpu}'.${vec4warn}`,
      );
    }
  }

  return new TSLAccessor(node, tgpuType);
}) as FromTSL);
