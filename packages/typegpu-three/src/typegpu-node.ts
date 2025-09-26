import type NodeFunction from 'three/src/nodes/core/NodeFunction.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import tgpu, { isVariable, type Namespace, type TgpuVar } from 'typegpu';
import type * as d from 'typegpu/data';

/**
 * State held by the node, used during shader generation.
 */
interface TgpuFnNodeData extends THREE.NodeData {
  initialized?: boolean;
  nodeFunction: NodeFunction;
  code: string;
  functionId: string;
  usedAccessors: { node: TSL.ShaderNodeObject<THREE.Node>; var: TgpuVar }[];
}

interface BuilderData {
  namespace: Namespace;
  names: WeakMap<TgpuVar, string>;
}

const builderDataMap = new WeakMap<THREE.NodeBuilder, BuilderData>();

interface TgpuFnNodeContext {
  usedAccessors: { node: TSL.ShaderNodeObject<THREE.Node>; var: TgpuVar }[];
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
      builderData = {
        names: new WeakMap(),
        namespace: tgpu['~unstable'].namespace(),
      };
      builderData.namespace.on('name', (event) => {
        if (isVariable(event.target)) {
          builderData?.names.set(event.target, event.name);
        }
      });
      builderDataMap.set(builder, builderData);
    }

    if (!nodeData.initialized) {
      nodeData.initialized = true;

      if (currentlyGeneratingFnNodeCtx !== undefined) {
        console.warn('Nested function generation detected');
      }

      const ctx: TgpuFnNodeContext = { usedAccessors: [] };
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

      console.log('Used accessors:', ctx.usedAccessors);
      nodeData.usedAccessors = ctx.usedAccessors;

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
      this.setIncludes([priors, ...ctx.usedAccessors.map((a) => a.node)]);

      // Extracting the function code
      const fnCode = code.slice(lastFnStart).trim();

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

    for (const accessor of nodeData.usedAccessors) {
      const varName = builderData.names.get(accessor.var);
      const varValue = accessor.node.build(builder);
      // @ts-ignore: It's there
      builder.addLineFlowCode(`${varName} = ${varValue};\n`, this);
    }

    if (output === 'property') {
      return nodeData.functionId;
    }
    return `${nodeData.functionId}()`;
  }
}

export function toTSL(
  fn: () => unknown,
): THREE.CodeNode {
  return new TgpuFnNode(fn);
}

class TSLAccessor<T extends d.AnyWgslData> {
  readonly #node: TSL.ShaderNodeObject<THREE.Node>;
  readonly #var: TgpuVar<'private', T>;

  constructor(
    node: TSL.ShaderNodeObject<THREE.Node>,
    dataType: T,
  ) {
    this.#node = node;
    this.#var = tgpu['~unstable'].privateVar(dataType);
  }

  get $(): d.InferGPU<T> {
    // TODO: Throw error if currentlyGeneratingFnNodeCtx is undefined
    currentlyGeneratingFnNodeCtx?.usedAccessors.push({
      node: this.#node,
      var: this.#var,
    });
    return this.#var.$;
  }
}

export function fromTSL<T extends d.AnyWgslData>(
  node: TSL.ShaderNodeObject<THREE.Node>,
  options: { type: T },
): TSLAccessor<T> {
  return new TSLAccessor<T>(node, options.type);
}
