import type NodeFunction from 'three/src/nodes/core/NodeFunction.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import tgpu, { isVariable, type Namespace, TgpuVar } from 'typegpu';
import type * as d from 'typegpu/data';

/**
 * State held by the node, used during shader generation.
 */
interface TgpuFnNodeData extends THREE.NodeData {
  custom: {
    nodeFunction: NodeFunction;
    fnCode: string;
    priorCode: THREE.Node;
    functionId: string;
    dependencies: TSLAccessor<d.AnyWgslData>[];
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

  getPlaceholder(accessor: TSLAccessor<d.AnyWgslData>): string {
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
  readonly dependencies: TSLAccessor<d.AnyWgslData>[];
}

let currentlyGeneratingFnNodeCtx: TgpuFnNodeContext | undefined;

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

      console.log('Used accessors:', ctx.dependencies);

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

      // Replacing placeholders
      for (const dep of ctx.dependencies) {
        console.log(dep.node.build(builder), dep.node.build(builder));
        fnCode = fnCode.replace(
          builderData.getPlaceholder(dep),
          dep.node.build(builder) as string,
        );
      }

      nodeData.custom = {
        functionId: functionId ?? '',
        nodeFunction: builder.parser.parseFunction(fnCode),
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
): THREE.Node {
  return new TgpuFnNode(fn);
}

class TSLAccessor<T extends d.AnyWgslData> {
  readonly #dataType: T;

  readonly var: TgpuVar<'private', T> | undefined;
  readonly node: TSL.ShaderNodeObject<THREE.Node>;

  constructor(
    node: TSL.ShaderNodeObject<THREE.Node>,
    dataType: T,
  ) {
    this.node = node;
    this.#dataType = dataType;

    // TODO: Only create a variable if it's not referentiable in the global scope
    this.var = tgpu.privateVar(dataType);
  }

  get $(): d.InferGPU<T> {
    const ctx = currentlyGeneratingFnNodeCtx;

    if (!ctx) {
      throw new Error('Can only access TSL nodes on the GPU.');
    }

    ctx.dependencies.push(this);

    if (this.var) {
      return this.var.$;
    }

    return tgpu['~unstable'].rawCodeSnippet(
      this.node.build(ctx.builder) as string,
      this.#dataType,
    ).$;
  }
}

export function fromTSL<T extends d.AnyWgslData>(
  node: TSL.ShaderNodeObject<THREE.Node>,
  options: { type: T },
): TSLAccessor<T> {
  return new TSLAccessor<T>(node, options.type);
}
