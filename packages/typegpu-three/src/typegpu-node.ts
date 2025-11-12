import type NodeFunction from 'three/src/nodes/core/NodeFunction.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import tgpu, { isVariable, type Namespace } from 'typegpu';
import type * as d from 'typegpu/data';

/**
 * State held by the node, used during shader generation.
 */
interface TgpuFnNodeData extends THREE.NodeData {
  initialized?: boolean;
  nodeFunction: NodeFunction;
  code: string;
  functionId: string;
  dependencies: TSLAccessor<d.AnyWgslData>[];
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

class TgpuFnNode<T> extends THREE.CodeNode {
  #impl: () => T;

  constructor(impl: () => T) {
    super('', [], 'wgsl');
    this.#impl = impl;
  }

  static get type() {
    return 'TgpuFnNode';
  }

  getNodeType(builder: THREE.NodeBuilder) {
    return this.getNodeFunction(builder).type;
  }

  getInputs(builder: THREE.NodeBuilder) {
    return this.getNodeFunction(builder).inputs;
  }

  getNodeFunction(builder: THREE.NodeBuilder) {
    const nodeData = builder.getDataFromNode(this) as TgpuFnNodeData;
    let builderData = builderDataMap.get(builder);

    if (!builderData) {
      builderData = new BuilderData();
      builderDataMap.set(builder, builderData);
    }

    if (!nodeData.initialized) {
      nodeData.initialized = true;

      if (currentlyGeneratingFnNodeCtx !== undefined) {
        console.warn('Nested function generation detected');
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
      nodeData.dependencies = ctx.dependencies;

      const [code = '', functionId] = resolved.split('___ID___').map((s) =>
        s.trim()
      );
      let lastFnStart = code.lastIndexOf('\nfn');
      if (lastFnStart === -1) {
        // We're starting with the function declaration
        lastFnStart = 0;
      }
      // Including code that was resolved before the function as another node
      // that this node depends on
      const priors = TSL.code(code.slice(0, lastFnStart) ?? '');
      this.setIncludes([priors, ...ctx.dependencies.map((d) => d.node)]);

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

      console.log(fnCode);

      this.code = fnCode ?? '';
      nodeData.functionId = functionId ?? '';
      nodeData.nodeFunction = builder.parser.parseFunction(this.code);
    }

    return nodeData.nodeFunction;
  }

  generate(
    builder: THREE.NodeBuilder,
    output: string | null | undefined,
  ): string | null | undefined {
    super.generate(builder);
    const nodeData = builder.getDataFromNode(this) as TgpuFnNodeData;
    const builderData = builderDataMap.get(builder) as BuilderData;

    // for (const accessor of nodeData.usedAccessors) {
    //   const varName = builderData.names.get(accessor.var);
    //   const varValue = accessor.node.build(builder);
    //   // @ts-expect-error: It's there
    //   builder.addLineFlowCode(`${varName} = ${varValue};\n`, this);
    // }

    if (output === 'property') {
      return nodeData.functionId;
    }
    return `${nodeData.functionId}()`;
  }
}

export function toTSL(
  fn: () => unknown,
): THREE.TSL.ShaderNodeFn<[number | THREE.Node, number | THREE.Node]> {
  return new TgpuFnNode(fn);
}

class TSLAccessor<T extends d.AnyWgslData> {
  readonly #dataType: T;
  // readonly #var: TgpuVar<'private', T>;

  readonly node: TSL.ShaderNodeObject<THREE.Node>;

  constructor(
    node: TSL.ShaderNodeObject<THREE.Node>,
    dataType: T,
  ) {
    this.node = node;
    this.#dataType = dataType;
    // this.#var = tgpu.privateVar(dataType);
  }

  get $(): d.InferGPU<T> {
    const ctx = currentlyGeneratingFnNodeCtx;

    if (!ctx) {
      throw new Error('Can only access TSL nodes on the GPU.');
    }

    ctx.dependencies.push(this);
    const placeholder = ctx.builderData.getPlaceholder(this);
    return tgpu['~unstable'].rawCodeSnippet(placeholder, this.#dataType).$;
  }
}

export function fromTSL<T extends d.AnyWgslData>(
  node: TSL.ShaderNodeObject<THREE.Node>,
  options: { type: T },
): TSLAccessor<T> {
  return new TSLAccessor<T>(node, options.type);
}
