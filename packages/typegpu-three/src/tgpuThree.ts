import * as THREE from 'three/webgpu';
import tgpu, { type TgpuFn } from 'typegpu';

class FragmentNode extends THREE.CodeNode {
  private tgslFn: TgpuFn;
  private functionName: string | null | undefined;
  private threeVars: THREE.TSL.ShaderNodeObject<THREE.Node>[] | undefined;
  private argNames: string[] | undefined;

  constructor(
    tgslFn: TgpuFn,
    threeRequirements?: THREE.TSL.ShaderNodeObject<THREE.Node>[] | undefined,
  ) {
    const resolved = tgpu.resolve({
      template: '___ID___ fnName',
      externals: { fnName: tgslFn },
    });
    const [code, functionName] = resolved.split('___ID___').map((s) =>
      s.trim()
    );
    let counter = 0;
    const args = tgslFn.shell.argTypes.map((type) =>
      `TGPUArg${counter++}_${type.type}`
    );
    const threeArgs = threeRequirements
      ? threeRequirements.map((node, i) => node.toVar(args[i]))
      : [];

    super(code, [...threeArgs], 'wgsl');

    this.functionName = functionName;
    this.threeVars = threeArgs;
    this.argNames = args;
    this.tgslFn = tgslFn;
  }

  static get type() {
    return 'FunctionNode';
  }

  getNodeType(builder: THREE.NodeBuilder) {
    return this.getNodeFunction(builder).type;
  }

  getInputs(builder: THREE.NodeBuilder) {
    return this.getNodeFunction(builder).inputs;
  }

  getNodeFunction(builder: THREE.NodeBuilder) {
    const nodeData = builder.getDataFromNode(this);

    // @ts-expect-error <- Three.js types suck
    let nodeFunction = nodeData.nodeFunction;

    if (nodeFunction === undefined) {
      nodeFunction = builder.parser.parseFunction(this.code);
      // @ts-expect-error <- Three.js types suck
      nodeData.nodeFunction = nodeFunction;
    }

    return nodeFunction;
  }

  generate(
    builder: THREE.NodeBuilder,
    output: string | null | undefined,
  ): string | null | undefined {
    super.generate(builder);

    const nodeFunction = this.getNodeFunction(builder);

    const name = nodeFunction.name;
    const type = nodeFunction.type;

    const nodeCode = builder.getCodeFromNode(this, type);

    if (name !== '') {
      // @ts-expect-error <- Three.js types suck
      nodeCode.name = name;
    }

    // @ts-expect-error <- Three.js types suck
    const propertyName = builder.getPropertyName(nodeCode, 'fragment');

    const code = this.getNodeFunction(builder).getCode(propertyName);
    // @ts-expect-error <- Three.js types suck
    nodeCode.code = `${code}\n`;

    if (output === 'property') {
      return this.functionName;
    }
    return `${this.functionName}(${this.argNames?.join(', ')})`;
  }
}

export class TypeGPUMaterial extends THREE.NodeMaterial {
  constructor(
    fragmentFn: TgpuFn,
    threeRequirements?: THREE.TSL.ShaderNodeObject<THREE.Node>[] | undefined,
  ) {
    super();

    this.fragmentNode = new FragmentNode(fragmentFn, threeRequirements);
  }
}
