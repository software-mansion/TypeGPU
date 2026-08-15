import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';
import WGSLNodeBuilder from 'three/src/renderers/webgpu/nodes/WGSLNodeBuilder.js';
// @ts-expect-error -- @types/three does not declare the WebGL fallback node builder.
import GLSLNodeBuilder from 'three/src/renderers/webgl-fallback/nodes/GLSLNodeBuilder.js';
import { describe, expect, it, vi } from 'vitest';
import { tgpu, d, std } from 'typegpu';
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
}

class THREERendererMock {
  backend: THREEWebGPUBackendMock | THREEWebGLBackendMock = new THREEWebGPUBackendMock();

  hasFeature() {
    return false;
  }
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

function webglBuilderFor(stage: 'analyze' | 'generate') {
  const renderer = new THREERendererMock();
  renderer.backend = new THREEWebGLBackendMock();

  const builder = new GLSLNodeBuilder(undefined, renderer as unknown as THREE.Renderer);
  builder.setShaderStage('fragment');
  builder.setBuildStage(stage);
  return builder;
}

function fragmentUniforms(builder: WGSLNodeBuilder) {
  return (
    builder as unknown as {
      uniforms: { fragment: { type: string }[] };
    }
  ).uniforms.fragment;
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

describe('TSL texture access', () => {
  it('loads from a Three.js DataTexture through a TypeGPU texture handle', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1);
    const textureAccess = fromTSL(texture, d.texture2d());

    const node = toTSL(() => {
      'use gpu';
      return std.textureLoad(textureAccess.$, d.vec2i(0), 0);
    });

    const builder = builderFor('generate');
    expect(() => node.build(builder)).not.toThrow();
    expect(builder.getCodes('fragment')).toContain('textureLoad');
    expect(fragmentUniforms(builder)).toHaveLength(1);
    expect(fragmentUniforms(builder)[0]?.type).toBe('texture');
  });

  it('samples a Three.js texture with its TSL sampler', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1);
    const textureAccess = fromTSL(texture, d.texture2d());
    const samplerAccess = fromTSL(TSL.sampler(texture), d.sampler());

    const node = toTSL(() => {
      'use gpu';
      return std.textureSample(textureAccess.$, samplerAccess.$, d.vec2f(0.5));
    });

    const builder = builderFor('generate');
    expect(() => node.build(builder)).not.toThrow();
    expect(builder.getCodes('fragment')).toContain('textureSample');
    expect(fragmentUniforms(builder)).toHaveLength(1);
  });

  it('loads from a Three.js texture with the WebGL backend', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1);
    const textureAccess = fromTSL(texture, d.texture2d());

    const node = toTSL(() => {
      'use gpu';
      return std.textureLoad(textureAccess.$, d.vec2i(0), 0);
    });

    const builder = webglBuilderFor('generate');
    expect(() => node.build(builder)).not.toThrow();
    expect(builder.getCodes('fragment')).toContain('texelFetch(nodeUniform0, ivec2(0), 0)');
    expect(builder.getCodes('fragment')).not.toContain('textureLoad');
  });

  it('samples a Three.js texture with the WebGL backend', () => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 128, 0, 255]), 1, 1);
    const textureAccess = fromTSL(texture, d.texture2d());
    const samplerAccess = fromTSL(TSL.sampler(texture), d.sampler());

    const node = toTSL(() => {
      'use gpu';
      return std.textureSample(textureAccess.$, samplerAccess.$, d.vec2f(0.5));
    });

    const builder = webglBuilderFor('generate');
    expect(() => node.build(builder)).not.toThrow();
    expect(builder.getCodes('fragment')).toContain('texture(nodeUniform0, vec2(0.5))');
    expect(builder.getCodes('fragment')).not.toContain('textureSample');
    expect(builder.getCodes('fragment')).not.toContain('nodeUniform0_sampler');
  });
});
