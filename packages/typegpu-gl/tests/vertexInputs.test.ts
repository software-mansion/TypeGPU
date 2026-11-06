import { describe, expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import { initWithGL } from '@typegpu/gl';
import { CrossShaderStageState, GlslGenerator } from '../src/glslGenerator.ts';
import { createStandInRoot } from '../src/standInRoot.ts';
import { it } from './utils/extendedTest.ts';

function resolveVertex(item: Parameters<typeof tgpu.resolve>[0][number]) {
  const state = new CrossShaderStageState();
  const code = tgpu.resolve([item], {
    unstable_shaderGenerator: new GlslGenerator('vertex', state),
  });
  return { code, inputs: Object.fromEntries(state.vertexInputs) };
}

describe('GlslGenerator - vertex inputs', () => {
  it('declares every attribute with the location TypeGPU assigned to it', () => {
    const vertex = tgpu.vertexFn({
      in: {
        position: d.vec3f,
        vid: d.builtin.vertexIndex,
        part: d.u32,
        normal: d.location(5, d.vec3f),
        uv: d.vec2f,
      },
      out: { pos: d.builtin.position },
    })((input) => {
      'use gpu';
      return {
        pos: d.vec4f(input.position + input.normal, d.f32(input.part + input.vid) + input.uv.x),
      };
    });

    const { code, inputs } = resolveVertex(vertex);

    expect(code).toContain('layout(location=0) in vec3 _in_position;');
    expect(code).toContain('layout(location=1) in uint _in_part;');
    expect(code).toContain('layout(location=5) in vec3 _in_normal;');
    expect(code).toContain('layout(location=2) in vec2 _in_uv;');
    expect(code).toContain('uint vid = uint(gl_VertexID);');
    expect(inputs).toStrictEqual({
      position: { name: '_in_position', location: 0, dataType: d.vec3f },
      part: { name: '_in_part', location: 1, dataType: d.u32 },
      normal: { name: '_in_normal', location: 5, dataType: d.vec3f },
      uv: { name: '_in_uv', location: 2, dataType: d.vec2f },
    });
  });

  it('records destructured inputs under their schema key, not their alias', () => {
    const vertex = tgpu.vertexFn({
      in: { position: d.vec2f },
      out: { pos: d.builtin.position },
    })(({ position: p }) => {
      'use gpu';
      return { pos: d.vec4f(p, 0, 1) };
    });

    const { code, inputs } = resolveVertex(vertex);

    expect(code).toContain('layout(location=0) in vec2 _in_position;');
    expect(Object.keys(inputs)).toStrictEqual(['position']);
  });

  it('declares the inputs of plain vertex functions with attributes', () => {
    const layout = tgpu.vertexLayout(d.disarrayOf(d.unstruct({ a: d.float32x3, b: d.unorm8x4 })));
    const root = createStandInRoot();
    const pipeline = root.createRenderPipeline({
      attribs: layout.attrib,
      vertex: ({ a, b, $instanceIndex }) => {
        'use gpu';
        return { $position: d.vec4f(a, b.x + d.f32($instanceIndex)) };
      },
      fragment: () => {
        'use gpu';
        return d.vec4f(1);
      },
    });

    const { code, inputs } = resolveVertex(pipeline);

    expect(code).toContain('layout(location=0) in vec3 _in_a;');
    expect(code).toContain('layout(location=1) in vec4 _in_b;');
    expect(code).toContain('VertexIn(_in_a, _in_b, uint(gl_InstanceID))');
    expect(inputs).toStrictEqual({
      a: { name: '_in_a', location: 0, dataType: d.vec3f },
      b: { name: '_in_b', location: 1, dataType: d.vec4f },
    });
  });

  it('throws when a vertex input is above the location limit of the device', ({ gl }) => {
    const root = initWithGL({ gl });
    const vertex = tgpu.vertexFn({
      in: { position: d.location(16, d.vec3f) },
      out: { pos: d.builtin.position },
    })((input) => {
      'use gpu';
      return { pos: d.vec4f(input.position, 1) };
    });
    const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
      'use gpu';
      return d.vec4f(1);
    });

    expect(() =>
      root.createRenderPipeline({ vertex, fragment }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[WebGLFallbackUnsupportedError: WebGL fallback does not support 'vertex input locations above 15' ('position' is at location 16, the maximum on this device is 15). Use WebGPU for full TypeGPU functionality.]`,
    );
  });
});
