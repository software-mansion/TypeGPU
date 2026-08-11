import type NodeFunction from 'three/src/nodes/core/NodeFunction.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import { tgpu, d, type Namespace, type TgpuVar, type ResolvedDeclaration } from 'typegpu';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
import { glOptions } from '@typegpu/gl';
import { wgslTypeToGlslType } from './common.ts';

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

let nextAccessorId = 0;

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
  return !!backend && 'isWebGLBackend' in backend && !!backend.isWebGLBackend;
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
        const result = tgpu.resolveWithContext([this.#impl], {
          names: stageData.namespace,
          ...(webgl ? glOptions() : {}),
        });

        if (webgl) {
          const dependencies = [...new Set(ctx.dependencies)];
          result.code = dependencies.reduce(
            (code, dependency) => dependency.rewriteWebglArrayAccesses(code, builder),
            result.code,
          );
          for (const declaration of result.declarations) {
            declaration.code = dependencies.reduce(
              (code, dependency) => dependency.rewriteWebglArrayAccesses(code, builder),
              declaration.code,
            );
          }
        }

        // Resolving this.#impl as second time in the same
        // namespace resolved to only its identifier
        const functionId = tgpu.resolve({
          names: stageData.namespace,
          template: 'impl',
          externals: { impl: this.#impl },
          ...(webgl ? glOptions() : {}),
        });

        return {
          code: result.code,
          declarations: result.declarations,
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
        template: '___ID___ fnName',
        externals: { fnName: this.#impl },
        ...(webgl ? glOptions() : {}),
      }),
    );
  }

  #setupFunction(builder: THREE.NodeBuilder) {
    const webgl = isWebGL(builder);
    let builderData = builderDataMap.get(builder);

    if (!builderData) {
      builderData = new BuilderData();
      builderDataMap.set(builder, builderData);
    }

    const stageData = builderData.getSetupStageData(builder.shaderStage);
    const ctx: TgpuFnNodeContext = { builder, stageData, dependencies: [] };

    withGeneratingFnNodeCtx(ctx, () =>
      tgpu.resolve({
        names: stageData.namespace,
        template: '___ID___ fnName',
        externals: { fnName: this.#impl },
        ...(webgl ? glOptions() : {}),
      }),
    );
  }

  setup(builder: THREE.NodeBuilder) {
    const outputNode = super.setup(builder);
    if (isWebGL(builder)) {
      this.#setupFunction(builder);
    }
    return outputNode;
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
      if (!dep.var) {
        continue;
      }

      const varValue = dep.node.build(builder);

      const code = tgpu.resolve({
        names: stageData.namespace,
        // oxlint-disable-next-line typescript/no-base-to-string
        template: `$var$ = ${varValue};\n`,
        externals: { $var$: dep.var },
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
  readonly #id = nextAccessorId++;

  #var: TgpuVar<'private', T> | undefined;
  readonly #webglElementReaders = new WeakMap<
    THREE.NodeBuilder,
    (index: THREE.TSL.NodeObject<THREE.Node>) => THREE.TSL.NodeObject<THREE.Node>
  >();
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

  rewriteWebglArrayAccesses(code: string, builder: THREE.NodeBuilder): string {
    if (!d.isWgslArray(this.#dataType)) {
      return code;
    }

    const marker = this.#webglArrayMarker;
    let result = '';
    let cursor = 0;

    while (true) {
      const markerStart = code.indexOf(`${marker}[`, cursor);
      if (markerStart === -1) {
        result += code.slice(cursor);
        return result;
      }

      const openingBracket = markerStart + marker.length;
      const closingBracket = findClosingBracket(code, openingBracket);
      if (closingBracket === -1) {
        throw new Error(`[@typegpu/three] Internal error, unmatched array access bracket.`);
      }

      const indexExpression = code.slice(openingBracket + 1, closingBracket);
      result += code.slice(cursor, markerStart);
      result += this.#buildWebglArrayElement(
        builder,
        indexExpression,
        isAssignmentTarget(code, closingBracket + 1),
      );
      cursor = closingBracket + 1;
    }
  }

  get #webglArrayMarker() {
    return `_typegpu_tsl_array_${this.#id}`;
  }

  #buildWebglArrayElement(
    builder: THREE.NodeBuilder,
    indexExpression: string,
    assignmentTarget: boolean,
  ): string {
    const storageNode = this.node as THREE.TSL.NodeObject<
      TNode & { element(index: THREE.TSL.NodeObject<THREE.Node>): THREE.TSL.NodeObject<THREE.Node> }
    >;

    // WebGL compute writes target the current transform-feedback element. Building
    // StorageArrayElementNode outside Three's assignment context would instead try
    // to read a PBO and produce a non-assignable expression.
    if (assignmentTarget) {
      return storageNode.build(builder) as string;
    }

    return this.#getWebglElementReader(
      builder,
      storageNode,
    )(TSL.expression(indexExpression, 'uint')).build(builder) as string;
  }

  #getWebglElementReader(
    builder: THREE.NodeBuilder,
    storageNode: THREE.TSL.NodeObject<
      TNode & { element(index: THREE.TSL.NodeObject<THREE.Node>): THREE.TSL.NodeObject<THREE.Node> }
    >,
  ) {
    let reader = this.#webglElementReaders.get(builder);
    if (!reader) {
      if (!d.isWgslArray(this.#dataType)) {
        throw new Error(`[@typegpu/three] Internal error, expected a storage array.`);
      }
      const elementType = this.#dataType.elementType.type;
      const tslType = wgslTypeToGlslType[elementType as keyof typeof wgslTypeToGlslType];
      if (!tslType) {
        throw new Error(
          `[@typegpu/three] WebGL storage-array access does not support element type '${elementType}'.`,
        );
      }

      reader = TSL.Fn(([index]: [THREE.TSL.NodeObject<THREE.Node>]) =>
        storageNode.element(index),
      ).setLayout({
        name: `typegpuReadStorage${this.#id}`,
        type: tslType,
        inputs: [{ name: 'index', type: 'uint' }],
      });
      this.#webglElementReaders.set(builder, reader);
    }

    return reader;
  }

  get $(): d.InferGPU<T> {
    const ctx = currentlyGeneratingFnNodeCtx;

    if (!ctx) {
      throw new Error('Can only access TSL nodes on the GPU.');
    }

    console.log(ctx.stageData.type, this.node, ctx.builder.getNodeProperties(this.node));

    if (ctx.stageData.type !== 'generate') {
      if (ctx.stageData.type === 'setup') {
        this.node.build(ctx.builder);
      } else {
        this.node.traverse((node: THREE.Node) => {
          node.analyze(ctx.builder);
        });
      }
      if (
        isWebGL(ctx.builder) &&
        d.isWgslArray(this.#dataType) &&
        // @ts-expect-error: assigned by Three.js at runtime
        this.node.isStorageBufferNode
      ) {
        const storageNode = this.node as THREE.TSL.NodeObject<
          TNode & {
            element(index: THREE.TSL.NodeObject<THREE.Node>): THREE.TSL.NodeObject<THREE.Node>;
          }
        >;
        const reader = this.#getWebglElementReader(
          ctx.builder,
          storageNode,
        )(TSL.expression('0u', 'uint'));
        if (ctx.stageData.type === 'setup') {
          reader.build(ctx.builder);
        } else {
          reader.traverse((node: THREE.Node) => node.analyze(ctx.builder));
        }
      }
      // dummy return, only for types to match
      return tgpu['~unstable'].rawCodeSnippet('', this.#dataType, 'runtime').$;
    }

    // oxlint-disable-next-line typescript/no-explicit-any -- smh
    ctx.dependencies.push(this as any);

    if (
      isWebGL(ctx.builder) &&
      d.isWgslArray(this.#dataType) &&
      // @ts-expect-error: assigned by Three.js at runtime
      this.node.isStorageBufferNode
    ) {
      return tgpu['~unstable'].rawCodeSnippet(this.#webglArrayMarker, this.#dataType).$;
    }

    const builtNode = this.node.build(ctx.builder) as string;

    // @ts-expect-error: it is assigned at runtime
    const trueVaryingNode = this.node.isVaryingNode && builtNode.includes('varyings.');

    if (trueVaryingNode) {
      this.#var = undefined; // cannot be checked earlier, ThreeJS is lazy
    }

    if (this.var) {
      return this.var.$;
    }

    return tgpu['~unstable'].rawCodeSnippet(builtNode, this.#dataType).$;
  }
}

function findClosingBracket(code: string, openingBracket: number): number {
  let depth = 0;
  for (let index = openingBracket; index < code.length; index++) {
    if (code[index] === '[') depth++;
    if (code[index] === ']') {
      depth--;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function isAssignmentTarget(code: string, start: number): boolean {
  const suffix = code.slice(start);
  return /^\s*(?:\.[A-Za-z_]\w*|\[[^\]]+\])*\s*(?:=|[+\-*/%&|^]=|<<=|>>=)(?!=)/.test(suffix);
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

function normalizeNodeType(builder: THREE.NodeBuilder, type: string) {
  if (isWebGL(builder)) {
    const wgslType = Object.entries(wgslTypeToGlslType).find(
      ([, glslType]) => glslType === type,
    )?.[0];
    return convertTypeToExplicit(wgslType ?? type);
  }
  return builder.getType(type);
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
    `${d.isWgslArray(tgpuType) ? tgpuType.elementType : tgpuType.type}`,
  );

  const inferenceBuilder =
    currentlyGeneratingFnNodeCtx?.builder ?? (sharedBuilder ??= new WGSLNodeBuilder());
  let nodeType: string | null = null;
  try {
    // sometimes it needs information (overrideNodes) from compilation context which is not present
    nodeType = node.getNodeType(inferenceBuilder);
  } catch {
    console.warn(`fromTSL: failed to infer node type via getNodeType; skipping type comparison.`);
  }

  if (nodeType) {
    const wgslTypeFromTSL = normalizeNodeType(inferenceBuilder, nodeType);
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
