import { it } from 'typegpu-testing-utility';
import { describe, expect } from 'vitest';
import { tgpu, d, std } from 'typegpu';

const layout = tgpu
  .bindGroupLayout({
    uTexture: { texture: d.texture2d(d.f32) },
    uSampler: { sampler: 'filtering' },
    uCmpSampler: { sampler: 'comparison' },
    uDepth: { texture: d.textureDepth2d() },
    uStorage: { storageTexture: d.textureStorage2d('rgba8unorm', 'write-only') },
  })
  .$idx(0);

describe('handle aliases', () => {
  it('aliases a texture const', () => {
    function foo() {
      'use gpu';
      const tex = layout.$.uTexture;
      return std.textureLoad(tex, d.vec2i(0, 0), 0);
    }
    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var uTexture: texture_2d<f32>;

      fn foo() -> vec4f {
        return textureLoad(uTexture, vec2i(), 0);
      }"
    `);
  });

  it('aliases a sampler const', () => {
    function foo(uv: d.v2f) {
      'use gpu';
      const smp = layout.$.uSampler;
      return std.textureSample(layout.$.uTexture, smp, uv);
    }
    expect(tgpu.resolve([tgpu.fn([d.vec2f], d.vec4f)(foo)])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var uTexture: texture_2d<f32>;

      @group(0) @binding(1) var uSampler: sampler;

      fn foo(uv: vec2f) -> vec4f {
        return textureSample(uTexture, uSampler, uv);
      }"
    `);
  });

  it('aliases both texture and sampler used in textureSample', () => {
    const frag = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
      'use gpu';
      const tex = layout.$.uTexture;
      const smp = layout.$.uSampler;
      return std.textureSample(tex, smp, uv);
    });
    expect(tgpu.resolve([frag])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var uTexture: texture_2d<f32>;

      @group(0) @binding(1) var uSampler: sampler;

      struct frag_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn frag(_arg_0: frag_Input) -> @location(0) vec4f {
        return textureSample(uTexture, uSampler, _arg_0.uv);
      }"
    `);
  });

  it('aliases a handle const used multiple times', () => {
    function foo(uv: d.v2f) {
      'use gpu';
      const tex = layout.$.uTexture;
      const smp = layout.$.uSampler;
      const a = std.textureSample(tex, smp, uv);
      const b = std.textureSample(tex, smp, uv.yx);
      return a.add(b).add(d.vec4f(d.f32(std.textureDimensions(tex).x)));
    }
    expect(tgpu.resolve([tgpu.fn([d.vec2f], d.vec4f)(foo)])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var uTexture: texture_2d<f32>;

      @group(0) @binding(1) var uSampler: sampler;

      fn foo(uv: vec2f) -> vec4f {
        let a = textureSample(uTexture, uSampler, uv);
        let b = textureSample(uTexture, uSampler, uv.yx);
        return ((a + b) + vec4f(f32(textureDimensions(uTexture).x)));
      }"
    `);
  });

  it('aliases a comparison sampler and a depth texture', () => {
    function foo(uv: d.v2f) {
      'use gpu';
      const depth = layout.$.uDepth;
      const cmp = layout.$.uCmpSampler;
      return std.textureSampleCompare(depth, cmp, uv, 0.5);
    }
    expect(tgpu.resolve([tgpu.fn([d.vec2f], d.f32)(foo)])).toMatchInlineSnapshot(`
      "@group(0) @binding(3) var uDepth: texture_depth_2d;

      @group(0) @binding(2) var uCmpSampler: sampler_comparison;

      fn foo(uv: vec2f) -> f32 {
        return textureSampleCompare(uDepth, uCmpSampler, uv, 0.5);
      }"
    `);
  });

  it('aliases a fixed sampler and a fixed texture view', ({ root }) => {
    const sampler = root.createSampler({ minFilter: 'linear', magFilter: 'linear' });
    const view = root
      .createTexture({ size: [16, 16], format: 'rgba8unorm' })
      .$usage('sampled')
      .createView(d.texture2d(d.f32));

    function foo(uv: d.v2f) {
      'use gpu';
      const smp = sampler.$;
      const tex = view.$;
      return std.textureSample(tex, smp, uv);
    }
    expect(tgpu.resolve([tgpu.fn([d.vec2f], d.vec4f)(foo)])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var view: texture_2d<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      fn foo(uv: vec2f) -> vec4f {
        return textureSample(view, sampler_1, uv);
      }"
    `);
  });

  it('aliases a storage texture const', () => {
    function foo() {
      'use gpu';
      const out = layout.$.uStorage;
      std.textureStore(out, d.vec2u(0, 0), d.vec4f(1));
    }
    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "@group(0) @binding(4) var uStorage: texture_storage_2d<rgba8unorm, write>;

      fn foo() {
        textureStore(uStorage, vec2u(), vec4f(1));
      }"
    `);
  });

  it('aliases a handle stored with let', () => {
    function foo() {
      'use gpu';
      let tex = layout.$.uTexture;
      return std.textureLoad(tex, d.vec2i(0, 0), 0);
    }
    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var uTexture: texture_2d<f32>;

      fn foo() -> vec4f {
        return textureLoad(uTexture, vec2i(), 0);
      }"
    `);
  });

  it('aliases a handle const derived from a function argument', () => {
    const sample = tgpu.fn(
      [d.texture2d(d.f32), d.sampler(), d.vec2f],
      d.vec4f,
    )((t, s, uv) => {
      'use gpu';
      const tex = t;
      return std.textureSample(tex, s, uv);
    });

    function foo(uv: d.v2f) {
      'use gpu';
      const tex = layout.$.uTexture;
      return sample(tex, layout.$.uSampler, uv);
    }
    expect(tgpu.resolve([tgpu.fn([d.vec2f], d.vec4f)(foo)])).toMatchInlineSnapshot(`
      "fn sample(t: texture_2d<f32>, s: sampler, uv: vec2f) -> vec4f {
        return textureSample(t, s, uv);
      }

      @group(0) @binding(0) var uTexture: texture_2d<f32>;

      @group(0) @binding(1) var uSampler: sampler;

      fn foo(uv: vec2f) -> vec4f {
        return sample(uTexture, uSampler, uv);
      }"
    `);
  });

  it('rejects reassigning a handle', () => {
    function foo() {
      'use gpu';
      let tex = layout.$.uTexture;
      tex = layout.$.uTexture;
      return std.textureLoad(tex, d.vec2i(0, 0), 0);
    }
    expect(() => tgpu.resolve([foo])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:foo
      - fn*:foo(): 'tex = layout.$.uTexture' is invalid, because textures and samplers cannot be mutated.]
    `);
  });
});
