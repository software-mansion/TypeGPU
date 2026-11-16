import { describe, expect } from 'vitest';
import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import { dualGlOptions } from '@typegpu/gl';
import { it } from 'typegpu-testing-utility';

describe('bind group layouts', () => {
  const Params = d.struct({ tint: d.vec4f });

  const layout = tgpu
    .bindGroupLayout({
      params: { uniform: Params },
      uTexture: { texture: d.texture2d(d.f32) },
      uSampler: { sampler: 'filtering' },
    })
    .$idx(0);

  function createPipeline(root: TgpuRoot) {
    return root.createRenderPipeline({
      vertex: () => {
        'use gpu';
        return { $position: d.vec4f(0, 0, 0, 1), uv: d.vec2f(0.5) };
      },
      fragment: ({ uv }) => {
        'use gpu';
        const color = std.textureSample(layout.$.uTexture, layout.$.uSampler, uv);
        return color * layout.$.params.tint;
      },
    });
  }

  it('resolves a laid-out texture and sampler to GLSL', ({ root }) => {
    const pipeline = createPipeline(root);
    const options = dualGlOptions();

    expect(tgpu.resolve([pipeline], options.vertex)).toMatchInlineSnapshot(`
      "out vec2 vary_uv;

      void main() {
        {
          gl_Position = vec4(0, 0, 0, 1);
          vary_uv = vec2(0.5);
          return;
        }
      }

      uniform sampler2D uTexture;

      uniform bool uTexture_flipY;

      vec2 flipYConditionally(vec2 coords, bool flip) {
        return mix(coords, vec2(coords.x, (1.0 - coords.y)), bvec2(flip));
      }

      struct Params {
        vec4 tint;
      };

      uniform Params params;

      "
    `);
    expect(tgpu.resolve([pipeline], options.fragment)).toMatchInlineSnapshot(`
      "

      uniform sampler2D uTexture;

      uniform bool uTexture_flipY;

      vec2 flipYConditionally(vec2 coords, bool flip) {
        return mix(coords, vec2(coords.x, (1.0 - coords.y)), bvec2(flip));
      }

      struct Params {
        vec4 tint;
      };

      uniform Params params;

      layout(location=0) out vec4 _fragColor;

      struct FragmentIn {
        vec2 uv;
      };

      in vec2 vary_uv;

      void main() {
        FragmentIn _arg_0 = FragmentIn(vary_uv);
        vec4 color = texture(uTexture, flipYConditionally(_arg_0.uv, uTexture_flipY));
        _fragColor = (color * params.tint);
      }"
    `);
  });

  it('resolves a laid-out texture and sampler to WGSL', ({ root }) => {
    const pipeline = createPipeline(root);

    expect(tgpu.resolve([pipeline])).toMatchInlineSnapshot(`
      "struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertex() -> VertexOut {
        return VertexOut(vec4f(0, 0, 0, 1), vec2f(0.5));
      }

      @group(0) @binding(1) var uTexture: texture_2d<f32>;

      @group(0) @binding(2) var uSampler: sampler;

      struct Params {
        tint: vec4f,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let color = textureSample(uTexture, uSampler, _arg_0.uv);
        return (color * params.tint);
      }"
    `);
  });
});
