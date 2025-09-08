import type NodeFunction from 'three/src/nodes/core/NodeFunction.js';
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import tgpu, { isTgpuFn, type TgpuFn } from 'typegpu';
import type * as d from 'typegpu/data';

/**
 * State held by the node, used during shader generation.
 */
interface TgpuFnNodeData extends THREE.NodeData {
  nodeFunction: NodeFunction;
}

class TgpuFnNode extends THREE.CodeNode {
  #tgpuFn: TgpuFn;
  #functionName: string | null | undefined;
  #threeVars: THREE.TSL.ShaderNodeObject<THREE.Node>[] | undefined;
  #argNames: string[] | undefined;

  constructor(tgpuFn: TgpuFn) {
    // TODO: Collect three requirements
    const threeRequirements: THREE.TSL.ShaderNodeObject<THREE.Node>[] = [];

    const resolved = tgpu.resolve({
      template: '___ID___ fnName',
      externals: { fnName: tgpuFn },
    });
    const [code, functionName] = resolved.split('___ID___').map((s) =>
      s.trim()
    );
    const args = tgpuFn.shell.argTypes.map((type, idx) =>
      `TGPUArg${idx}_${type.type}`
    );

    const threeArgs = threeRequirements
      ? threeRequirements.map((node, i) => node.toVar(args[i]))
      : [];

    super(code, [...threeArgs], 'wgsl');

    this.#tgpuFn = tgpuFn;
    this.#functionName = functionName;
    this.#threeVars = threeArgs;
    this.#argNames = args;
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

    let nodeFunction = nodeData.nodeFunction;
    if (nodeFunction === undefined) {
      nodeFunction = builder.parser.parseFunction(this.code);
      nodeData.nodeFunction = nodeFunction;
    }

    return nodeFunction;
  }

  generate(
    builder: THREE.NodeBuilder,
    output: string | null | undefined,
  ): string | null | undefined {
    super.generate(builder);

    if (output === 'property') {
      return this.#functionName;
    }
    return `${this.#functionName}(${this.#argNames?.join(', ')})`;
  }
}

export function toTSL(
  fn: () => unknown,
): THREE.CodeNode {
  if (!isTgpuFn(fn)) {
    throw new Error('Expected a TgpuFn');
  }
  return new TgpuFnNode(fn);
}

class TSLAccessor<T extends d.AnyWgslData> {
  readonly #node: TSL.ShaderNodeObject<THREE.Node>;
  readonly #dataType: T;
  readonly #varNode: TSL.ShaderNodeObject<THREE.Node>;

  constructor(
    node: TSL.ShaderNodeObject<THREE.Node>,
    dataType: T,
  ) {
    this.#node = node;
    this.#dataType = dataType;
    this.#varNode = TSL.vec2(node);
    // this.#varNode.assign(node);
  }

  get $(): d.Infer<T> {
    console.log(this.#varNode);
    // TODO: Return something that works here
    return TSL.vec2() as unknown as d.Infer<T>;
  }
}

export function fromTSL<T extends d.AnyWgslData>(
  node: TSL.ShaderNodeObject<THREE.Node>,
  options: { type: T },
): TSLAccessor<T> {
  return new TSLAccessor<T>(node, options.type);
}
