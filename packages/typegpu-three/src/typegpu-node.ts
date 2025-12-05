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
    fnCode: string;
    priorCode: THREE.Node;
    functionId: string;
    dependencies: TSLAccessor<d.AnyWgslData, THREE.Node>[];
  };
}

class BuilderData {
  names: WeakMap<object, string>;
  namespace: Namespace;

  #lastPlaceholderId = 0;

  constructor() {
    this.names = new WeakMap();
    this.namespace = tgpu['~unstable'].namespace();

    this.namespace.on('name', (event) => {
      if (isVariable(event.target)) {
        this.names.set(event.target, event.name);
      }
    });
  }

  getPlaceholder(accessor: TSLAccessor<d.AnyWgslData, THREE.Node>): string {
    let placeholder = this.names.get(accessor);
    if (!placeholder) {
      placeholder = `$$TYPEGPU_TSL_ACCESSOR_${this.#lastPlaceholderId++}$$`;
      this.names.set(accessor, placeholder);
    }
    return placeholder;
  }
}

const builderDataMap = new WeakMap<THREE.NodeBuilder, BuilderData>();

interface TgpuFnNodeContext {
  readonly builder: THREE.NodeBuilder;
  readonly builderData: BuilderData;
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

    if (!nodeData.custom) {
      if (currentlyGeneratingFnNodeCtx !== undefined) {
        console.warn('[@typegpu/three] Nested function generation detected');
      }

      const ctx: TgpuFnNodeContext = {
        builder,
        builderData,
        dependencies: [],
      };
      currentlyGeneratingFnNodeCtx = ctx;
      let resolved: string;
      try {
        resolved = tgpu.resolve({
          names: builderData.namespace,
          template: '___ID___ fnName',
          externals: { fnName: this.#impl },
        });
      } finally {
        currentlyGeneratingFnNodeCtx = undefined;
      }

      const [code = '', functionId] = resolved.split('___ID___').map((s) =>
        s.trim()
      );
      let lastFnStart = code.lastIndexOf('\nfn');
      if (lastFnStart === -1) {
        // We're starting with the function declaration
        lastFnStart = 0;
      }

      // Extracting the function code
      let fnCode = code.slice(lastFnStart).trim();

      // TODO: Placeholders aren't necessary
      // Replacing placeholders
      for (const dep of ctx.dependencies) {
        fnCode = fnCode.replace(
          builderData.getPlaceholder(dep),
          dep.node.build(builder) as string,
        );
      }

      nodeData.custom = {
        functionId: functionId ?? '',
        nodeFunction: builder.parser.parseFunction(
          // TODO: Upstream a fix to Three.js that accepts functions with no return type
          forceExplicitVoidReturn(fnCode),
        ),
        fnCode,
        // Including code that was resolved before the function as another node
        // that this node depends on
        priorCode: TSL.code(code.slice(0, lastFnStart) ?? ''),
        dependencies: ctx.dependencies,
      };
    }

    return nodeData.custom.nodeFunction;
  }

  generate(
    builder: THREE.NodeBuilder,
    output: string | null | undefined,
  ): string | null | undefined {
    this.#getNodeFunction(builder); // making sure the node function exists

    const nodeData = builder.getDataFromNode(this) as TgpuFnNodeData;
    const builderData = builderDataMap.get(builder) as BuilderData;

    // Building dependencies
    for (const dep of nodeData.custom.dependencies) {
      dep.node.build(builder);
    }
    nodeData.custom.priorCode.build(builder);

    for (const dep of nodeData.custom.dependencies) {
      if (!dep.var) {
        continue;
      }

      const varName = builderData.names.get(dep.var);
      const varValue = dep.node.build(builder);
      // @ts-expect-error: It's there
      builder.addLineFlowCode(`${varName} = ${varValue};\n`, this);
    }

    const nodeCode = builder.getCodeFromNode(this, this.getNodeType(builder));
    // @ts-expect-error
    nodeCode.code = nodeData.custom.fnCode;

    if (output === 'property') {
      return nodeData.custom.functionId;
    }
    return `${nodeData.custom.functionId}()`;
  }
}

export function toTSL(
  fn: () => unknown,
): THREE.TSL.ShaderNodeObject<THREE.Node> {
  return TSL.nodeObject(new TgpuFnNode(fn));
}

export class TSLAccessor<T extends d.AnyWgslData, TNode extends THREE.Node> {
  readonly #dataType: T;

  readonly var: TgpuVar<'private', T> | undefined;
  readonly node: TSL.ShaderNodeObject<TNode>;

  constructor(
    node: TSL.ShaderNodeObject<TNode>,
    dataType: T,
  ) {
    this.node = node;
    this.#dataType = dataType;

    // TODO: Only create a variable if it's not referentiable in the global scope
    // @ts-expect-error: The properties exist on the node
    if (!node.isStorageBufferNode && !node.isUniformNode) {
      this.var = tgpu.privateVar(dataType);
    }
  }

  get $(): d.InferGPU<T> {
    const ctx = currentlyGeneratingFnNodeCtx;

    if (!ctx) {
      throw new Error('Can only access TSL nodes on the GPU.');
    }

    // biome-ignore lint/suspicious/noExplicitAny: smh
    ctx.dependencies.push(this as any);

    if (this.var) {
      return this.var.$;
    }

    return tgpu['~unstable'].rawCodeSnippet(
      this.node.build(ctx.builder) as string,
      this.#dataType,
    ).$;
  }
}

export function fromTSL<T extends d.AnyWgslData, TNode extends THREE.Node>(
  node: TSL.ShaderNodeObject<TNode>,
  options: { type: (length: number) => T },
): TSLAccessor<T, TNode>;
export function fromTSL<T extends d.AnyWgslData, TNode extends THREE.Node>(
  node: TSL.ShaderNodeObject<TNode>,
  options: { type: T },
): TSLAccessor<T, TNode>;
export function fromTSL<T extends d.AnyWgslData, TNode extends THREE.Node>(
  node: TSL.ShaderNodeObject<TNode>,
  options: { type: T } | { type: (length: number) => T },
): TSLAccessor<T, TNode> {
  const tgpuType = d.isData(options.type)
    ? options.type as T
    : (options.type as (length: number) => T)(0);

  const builder = new WGSLNodeBuilder();

  const nodeType = (typeof node.getNodeType === 'function')
    ? node.getNodeType(builder)
    : (node.nodeType || null);

  if (!nodeType) {
    console.log('Node type is missing or could not be resolved.');
  } else {
    const wgslType = builder.getType(nodeType);
    console.log(`TSL '${wgslType}' ('${nodeType}') vs TGPU '${tgpuType}'`);
  }

  return new TSLAccessor<T, TNode>(node, tgpuType);
}
