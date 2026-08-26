import { describe, expect, vi } from 'vitest';
import { d, std } from 'typegpu';
import { initWithGL } from '../src/index.ts';
import { it } from './utils/extendedTest.ts';

describe('TgpuRootWebGL - texture/sampler pairing', () => {
  it('throws when a texture is sampled by two different samplers', ({ gl }) => {
    const root = initWithGL({ gl });
    const texture = root.createTexture({ size: [2, 2], format: 'rgba8unorm' }).$usage('sampled');
    const view = texture.createView().$name('tex');
    const linearSampler = root.createSampler({ magFilter: 'linear' }).$name('linearSampler');
    const nearestSampler = root.createSampler({ magFilter: 'nearest' }).$name('nearestSampler');

    expect(() =>
      root.createRenderPipeline({
        vertex: () => {
          'use gpu';
          return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
        },
        fragment: ({ uv }) => {
          'use gpu';
          const a = std.textureSample(view.$, linearSampler.$, uv);
          const b = std.textureSample(view.$, nearestSampler.$, uv);
          return d.vec4f(a.rgb + b.rgb, 1);
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - renderPipeline:fakePipeline
      - renderPipelineCore
      - autoFragmentFn
      - fn:textureSample: WebGL fallback does not support sampling the same texture with multiple samplers in one pipeline ('tex').]
    `);
  });

  it('allows a sampler to sample two different textures', ({ gl }) => {
    const root = initWithGL({ gl });
    const textureA = root
      .createTexture({ size: [2, 2], format: 'rgba8unorm' })
      .$usage('sampled')
      .$name('textureA');
    const textureB = root
      .createTexture({ size: [2, 2], format: 'rgba8unorm' })
      .$usage('sampled')
      .$name('textureB');
    const viewA = textureA.createView().$name('viewA');
    const viewB = textureB.createView().$name('viewB');
    const sampler = root
      .createSampler({ magFilter: 'linear', minFilter: 'linear' })
      .$name('sharedSampler');

    const pipeline = root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
      },
      fragment: ({ uv }) => {
        'use gpu';
        const a = std.textureSample(viewA.$, sampler.$, uv);
        const b = std.textureSample(viewB.$, sampler.$, uv);
        return d.vec4f(a.rgb * 0.5 + b.rgb * 0.5, 1);
      },
    });

    expect(() => pipeline.draw(3)).not.toThrow();

    const rawTextures = vi.mocked(gl.createTexture).mock.results.map((r) => r.value);
    const [rawSampler] = vi.mocked(gl.createSampler).mock.results.map((r) => r.value);

    // Each texture gets its own texture unit...
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, rawTextures[0]);
    expect(gl.bindTexture).toHaveBeenCalledWith(gl.TEXTURE_2D, rawTextures[1]);
    // ...and the same sampler is bound on both units.
    expect(gl.bindSampler).toHaveBeenCalledWith(0, rawSampler);
    expect(gl.bindSampler).toHaveBeenCalledWith(1, rawSampler);

    // Texture uniform locations point at consecutive units.
    const unitCalls = vi
      .mocked(gl.uniform1i)
      .mock.calls.filter(
        ([location]) =>
          (location as { name?: string }).name?.startsWith('view') &&
          !(location as { name?: string }).name?.includes('flipY'),
      );
    expect(unitCalls).toMatchInlineSnapshot(`
      [
        [
          {
            "_type": "uniform-location",
            "name": "viewA",
          },
          0,
        ],
        [
          {
            "_type": "uniform-location",
            "name": "viewB",
          },
          1,
        ],
      ]
    `);

    // Each texture has its own flipY uniform.
    const flipCalls = vi
      .mocked(gl.uniform1i)
      .mock.calls.filter(
        ([location]) => (location as { name?: string }).name?.includes('flipY') === true,
      );
    expect(flipCalls).toMatchInlineSnapshot(`
      [
        [
          {
            "_type": "uniform-location",
            "name": "viewA_flipY",
          },
          0,
        ],
        [
          {
            "_type": "uniform-location",
            "name": "viewB_flipY",
          },
          0,
        ],
      ]
    `);

    const sources = vi.mocked(gl.shaderSource).mock.calls.map((call) => call[1]);
    expect(sources[1]).toMatchInlineSnapshot(`
      "#version 300 es
      precision highp float;
      precision highp int;

      uniform sampler2D viewA;

      uniform bool viewA_flipY;

      vec2 flipYConditionally(vec2 coords, bool flip) {
        return mix(coords, vec2(coords.x, (1.0 - coords.y)), bvec2(flip));
      }

      uniform sampler2D viewB;

      uniform bool viewB_flipY;

      layout(location=0) out vec4 _fragColor;

      struct FragmentIn {
        vec2 uv;
      };

      in vec2 vary_uv;

      void main() {
        FragmentIn _arg_0 = FragmentIn(vary_uv);
        vec4 a = texture(viewA, flipYConditionally(_arg_0.uv, viewA_flipY));
        vec4 b = texture(viewB, flipYConditionally(_arg_0.uv, viewB_flipY));
        _fragColor = vec4(((a.rgb * 0.5) + (b.rgb * 0.5)), 1.0);
      }"
    `); // fragment shader
  });
});
