import type NodeFunction from 'three/src/nodes/core/NodeFunction.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import tgpu, { isVariable, type Namespace, type TgpuVar } from 'typegpu';
import * as d from 'typegpu/data';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';

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
  declare readonly type: 'analyze' | 'generate';
  readonly stage: 'vertex' | 'fragment' | 'compute' | null;
  readonly namespace: Namespace;

  constructor(stage: 'vertex' | 'fragment' | 'compute' | null) {
    this.stage = stage;
    this.namespace = tgpu['~unstable'].namespace();
  }
}

class GenerateStageData extends StageData {
  readonly names: WeakMap<object, string>;
  readonly type = 'generate';
  codeGeneratedThusFar: string;

  constructor(stage: 'vertex' | 'fragment' | 'compute' | null) {
    super(stage);
    this.names = new WeakMap();
    this.codeGeneratedThusFar = '';

    this.namespace.on('name', (event) => {
      if (isVariable(event.target)) {
        this.names.set(event.target, event.name);
      }
    });
  }
}

class AnalyzeStageData extends StageData {
  readonly type = 'analyze';
}

class BuilderData {
  generateStageDataMap: Map<
    'vertex' | 'fragment' | 'compute' | null,
    GenerateStageData
  >;
  analyzeStageDataMap: Map<
    'vertex' | 'fragment' | 'compute' | null,
    AnalyzeStageData
  >;

  constructor() {
    this.generateStageDataMap = new Map();
    this.analyzeStageDataMap = new Map();
  }

  getGenerateStageData(
    stage: 'vertex' | 'fragment' | 'compute' | null,
  ): GenerateStageData {
    let stageData = this.generateStageDataMap.get(stage);
    if (!stageData) {
      stageData = new GenerateStageData(stage);
      this.generateStageDataMap.set(stage, stageData);
    }
    return stageData;
  }

  getAnalyzeStageData(
    stage: 'vertex' | 'fragment' | 'compute' | null,
  ): AnalyzeStageData {
    let stageData = this.analyzeStageDataMap.get(stage);
    if (!stageData) {
      stageData = new AnalyzeStageData(stage);
      this.analyzeStageDataMap.set(stage, stageData);
    }
    return stageData;
  }
}

const builderDataMap = new WeakMap<THREE.NodeBuilder, BuilderData>();

interface TgpuFnNodeContext {
  readonly builder: THREE.NodeBuilder;
  readonly stageData: StageData;
  readonly dependencies: TSLAccessor<d.AnyWgslData, THREE.Node>[];
}

let currentlyGeneratingFnNodeCtx: TgpuFnNodeContext | undefined;

function forceExplicitVoidReturn(codeIn: string) {
  if (codeIn.includes('->')) {
    // Has return type, so we don't need to force it
    return codeIn;
  }

  const closingParen = codeIn.indexOf(')');
  if (closingParen === -1) {
    throw new Error('Invalid code: missing closing parenthesis');
  }

  return codeIn.substring(0, closingParen + 1) + '-> void' +
    codeIn.substring(closingParen + 1);
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
    const nodeData = builder.getDataFromNode(this) as TgpuFnNodeData;
    let builderData = builderDataMap.get(builder);

    if (!builderData) {
      builderData = new BuilderData();
      builderDataMap.set(builder, builderData);
    }

    const stageData = builderData.getGenerateStageData(builder.shaderStage);

    if (!nodeData.custom) {
      if (currentlyGeneratingFnNodeCtx !== undefined) {
        console.warn('[@typegpu/three] Nested function generation detected');
      }

      const ctx: TgpuFnNodeContext = {
        builder,
        stageData,
        dependencies: [],
      };
      currentlyGeneratingFnNodeCtx = ctx;
      let resolved: string;
      try {
        resolved = tgpu.resolve({
          names: stageData.namespace,
          template: '___ID___ fnName',
          externals: { fnName: this.#impl },
        });
      } finally {
        currentlyGeneratingFnNodeCtx = undefined;
      }

      const [code = '', functionId] = resolved.split('___ID___').map((s) =>
        s.trim()
      );
      stageData.codeGeneratedThusFar += code;
      let lastFnStart = stageData.codeGeneratedThusFar.indexOf(
        `\nfn ${functionId}`,
      );
      if (lastFnStart === -1) {
        // We're starting with the function declaration
        lastFnStart = 0;
      }

      // Extracting the function code
      const fnCode = stageData.codeGeneratedThusFar.slice(lastFnStart).trim();

      nodeData.custom = {
        functionId: functionId ?? '',
        nodeFunction: builder.parser.parseFunction(
          // TODO: Upstream a fix to Three.js that accepts functions with no return type
          forceExplicitVoidReturn(fnCode),
        ),
        // Including code that was resolved before the function as another node
        // that this node depends on
        priorCode: TSL.code(code),
        dependencies: ctx.dependencies,
      };
    }

    return nodeData.custom.nodeFunction;
  }

  #analyzeFunction(builder: THREE.NodeBuilder) {
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
    currentlyGeneratingFnNodeCtx = ctx;
    try {
      tgpu.resolve({
        names: stageData.namespace,
        template: '___ID___ fnName',
        externals: { fnName: this.#impl },
      });
    } finally {
      currentlyGeneratingFnNodeCtx = undefined;
    }
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
      if (!dep.var) {
        continue;
      }

      const varName = stageData.names.get(dep.var);
      const varValue = dep.node.build(builder);
      // @ts-expect-error: It's there
      // oxlint-disable-next-line typescript/no-base-to-string
      builder.addLineFlowCode(`${varName} = ${varValue};\n`, this);
    }

    return output === 'property'
      ? nodeData.custom.functionId
      : `${nodeData.custom.functionId}()`;
  }
}

export function toTSL(
  fn: () => unknown,
): THREE.TSL.NodeObject<THREE.Node> {
  return TSL.nodeObject(new TgpuFnNode(fn));
}

export class TSLAccessor<T extends d.AnyWgslData, TNode extends THREE.Node> {
  readonly #dataType: T;

  #var: TgpuVar<'private', T> | undefined;
  readonly node: THREE.TSL.NodeObject<TNode>;

  constructor(
    node: THREE.TSL.NodeObject<TNode>,
    dataType: T,
  ) {
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

    // oxlint-disable-next-line typescript/no-explicit-any smh
    ctx.dependencies.push(this as any);

    const builtNode = this.node.build(ctx.builder) as string;

    // @ts-expect-error: it is assigned at runtime
    const trueVaryingNode = this.node.isVaryingNode &&
      builtNode.includes('varyings.');

    if (trueVaryingNode) {
      this.#var = undefined; // cannot be checked earlier, ThreeJS is lazy
    }

    if (this.var) {
      return this.var.$;
    }

    return tgpu['~unstable'].rawCodeSnippet(
      builtNode,
      this.#dataType,
    ).$;
  }
}

const typeMap = {
  'f': 'f32',
  'h': 'f16',
  'i': 'i32',
  'u': 'u32',
  'b': 'bool',
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

type FromTSL =
  & (<T extends d.AnyWgslData, TNode extends THREE.Node>(
    node: THREE.TSL.NodeObject<TNode>,
    type: (length: number) => T,
  ) => TSLAccessor<T, TNode>)
  & (<T extends d.AnyWgslData, TNode extends THREE.Node>(
    node: THREE.TSL.NodeObject<TNode>,
    type: T,
  ) => TSLAccessor<T, TNode>);

export const fromTSL = tgpu.comptime(
  ((node, type) => {
    const tgpuType = d.isData(type)
      ? type
      : (type as (length: number) => d.AnyWgslData)(0);

    // In THREE, the type of array buffers equals to the type of the element.
    const wgslTypeFromTgpu = convertTypeToExplicit(
      `${d.isWgslArray(tgpuType) ? tgpuType.elementType : tgpuType}`,
    );

    if (!sharedBuilder) {
      sharedBuilder = new WGSLNodeBuilder();
    }
    let nodeType: string | null = null;
    try { // sometimes it needs information (overrideNodes) from compilation context which is not present
      nodeType = node.getNodeType(sharedBuilder);
    } catch (e) {
      console.warn(
        `fromTSL: failed to infer node type via getNodeType; skipping type comparison.`,
      );
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
  }) as FromTSL,
);
