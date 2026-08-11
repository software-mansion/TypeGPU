import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
// @ts-expect-error: DefinitelyTyped does not expose Three's fallback builder module.
import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js';
import { describe, expect, it, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { fromTSL, toTSL } from '@typegpu/three';

class ObservableFloatNode extends THREE.Node {
  analyzeCount = 0;
  generateCount = 0;

  getNodeType() {
    return 'float';
  }

  analyze() {
    this.analyzeCount += 1;
  }

  generate() {
    this.generateCount += 1;
    return '1.0';
  }
}

class THREEWebGPUBackendMock {
  isWebGPUBackend = true;
}

class THREEWebGLBackendMock {
  isWebGLBackend = true;
  extensions = new Set();

  has() {
    return false;
  }
}

class THREERendererMock {
  backend = new THREEWebGPUBackendMock();
}

function observableAccessor() {
  const node = new ObservableFloatNode();
  return {
    node,
    accessor: fromTSL(TSL.nodeObject(node), d.f32),
  };
}

function builderFor(stage: 'analyze' | 'generate') {
  const builder = new WGSLNodeBuilder();
  builder.renderer = new THREERendererMock() as unknown as THREE.Renderer;
  builder.setShaderStage('fragment');
  builder.setBuildStage(stage);
  return builder;
}

function webglBuilderFor(stage: 'setup' | 'analyze' | 'generate') {
  const renderer = { backend: new THREEWebGLBackendMock() } as unknown as THREE.Renderer;
  const builder = new GLSLNodeBuilder(undefined, renderer);
  builder.setShaderStage('compute');
  builder.setBuildStage(stage);
  return builder;
}

class WebGLStorageArrayNode extends THREE.Node {
  isStorageBufferNode = true;

  getNodeType() {
    return 'vec3';
  }

  element = (index: THREE.TSL.NodeObject<THREE.Node>) => TSL.vec3(index);

  generate() {
    return 'storageValue';
  }
}

describe('TypeGPU node generation context', () => {
  it.each(['analyze', 'generate'] as const)(
    'restores the outer context after nested %s traversal',
    (stage) => {
      const before = observableAccessor();
      const inner = observableAccessor();
      const after = observableAccessor();

      const innerNode = toTSL(() => {
        'use gpu';
        return inner.accessor.$;
      });
      const innerNodeAccessor = fromTSL(innerNode, d.f32);

      const outerNode = toTSL(() => {
        'use gpu';
        return before.accessor.$ + innerNodeAccessor.$ + after.accessor.$;
      });

      expect(() => outerNode.build(builderFor(stage))).not.toThrow();

      if (stage === 'analyze') {
        expect(before.node.analyzeCount).toBe(1);
        expect(inner.node.analyzeCount).toBe(1);
        expect(after.node.analyzeCount).toBe(1);
      } else {
        expect(before.node.generateCount).toBe(1);
        expect(inner.node.generateCount).toBe(1);
        expect(after.node.generateCount).toBe(1);
      }
    },
  );

  it('restores the outer context when nested generation throws and is caught', () => {
    const before = observableAccessor();
    const after = observableAccessor();
    const fail = tgpu.comptime(() => {
      throw new Error('inner failure');
    });

    class CatchingNode extends THREE.Node {
      getNodeType() {
        return 'float';
      }

      generate(builder: THREE.NodeBuilder) {
        const throwingInner = toTSL(() => {
          'use gpu';
          fail();
          return d.f32(0);
        });

        expect(() => throwingInner.getNodeType(builder)).toThrow('inner failure');
        return '2.0';
      }
    }

    const catchingAccessor = fromTSL(TSL.nodeObject(new CatchingNode()), d.f32);
    const outerNode = toTSL(() => {
      'use gpu';
      return before.accessor.$ + catchingAccessor.$ + after.accessor.$;
    });

    expect(() => outerNode.build(builderFor('generate'))).not.toThrow();
    expect(before.node.generateCount).toBe(1);
    expect(after.node.generateCount).toBe(1);
  });
});

describe('WebGL storage arrays', () => {
  it('lowers array reads through a typed TSL helper and writes to the current element', () => {
    const storageNode = TSL.nodeObject(new WebGLStorageArrayNode());
    const storage = fromTSL(storageNode, d.arrayOf(d.vec3f));
    const fn = toTSL(() => {
      'use gpu';
      const value = storage.$[2] as d.v3f;
      storage.$[2] = d.vec3f(value);
    });
    const builder = webglBuilderFor('setup');

    fn.build(builder);
    builder.setBuildStage('analyze');
    fn.build(builder);
    builder.setBuildStage('generate');

    expect(() => fn.build(builder)).not.toThrow();
    expect(builder.getCodes('compute')).toContain('typegpuReadStorage');
    expect(builder.getCodes('compute')).not.toContain('_typegpu_tsl_array_');
  });

  it('uses the active WebGL builder to infer nested toTSL return types', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const inner = toTSL(() => {
      'use gpu';
      return d.u32(1);
    });
    const converted = TSL.int(inner);
    const outer = toTSL(() => {
      'use gpu';
      return fromTSL(converted, d.i32).$;
    });
    const builder = webglBuilderFor('generate');

    expect(() => outer.build(builder)).not.toThrow();
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });
});

describe('WebGL storage arrays', () => {
  it('lowers array reads through a typed TSL helper and writes to the current element', () => {
    const storageNode = TSL.nodeObject(new WebGLStorageArrayNode());
    const storage = fromTSL(storageNode, d.arrayOf(d.vec3f));
    const fn = toTSL(() => {
      'use gpu';
      const value = storage.$[2] as d.v3f;
      storage.$[2] = d.vec3f(value);
    });
    const builder = webglBuilderFor('setup');

    fn.build(builder);
    builder.setBuildStage('analyze');
    fn.build(builder);
    builder.setBuildStage('generate');

    expect(() => fn.build(builder)).not.toThrow();
    expect(builder.getCodes('compute')).toContain('typegpuReadStorage');
    expect(builder.getCodes('compute')).not.toContain('_typegpu_tsl_array_');
  });

  it('uses the active WebGL builder to infer nested toTSL return types', () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const inner = toTSL(() => {
      'use gpu';
      return d.u32(1);
    });
    const converted = TSL.int(inner);
    const outer = toTSL(() => {
      'use gpu';
      return fromTSL(converted, d.i32).$;
    });
    const builder = webglBuilderFor('generate');

    expect(() => outer.build(builder)).not.toThrow();
    expect(warning).not.toHaveBeenCalled();
    warning.mockRestore();
  });
});
