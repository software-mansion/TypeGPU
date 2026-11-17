import { PostEffect } from '@pixi/3d';
import { describe, expect, it } from 'vitest';
import { d, std } from 'typegpu';
import * as p3d from '@typegpu/pixi/3d';

describe('effectFragment', () => {
  it('generates `effect(uv)` in WGSL and GLSL', () => {
    const vignetteUniforms = p3d.uniforms({ strength: d.f32 });

    const fragment = p3d.effectFragment({
      uniforms: vignetteUniforms,
      effect: (uv) => {
        'use gpu';
        const color = p3d.sampleColor(uv);
        const edge = std.smoothstep(0.3, 0.8, std.distance(uv, d.vec2f(0.5)));
        return d.vec4f(color.rgb * (1 - edge * vignetteUniforms.$.strength), color.a);
      },
    });

    expect(fragment.gpu).toMatchInlineSnapshot(`
      "fn tgpu_sampleColor(_pixiUv: vec2f) -> vec4f {
        return sampleColor(_pixiUv);
      }

      fn tgpu_effect(uv: vec2f) -> vec4f {
        let color = tgpu_sampleColor(uv);
        let edge = smoothstep(0.3f, 0.8f, distance(uv, vec2f(0.5)));
        return vec4f((color.rgb * (1f - (edge * fx.strength))), color.a);
      }

      fn effect(uv: vec2f) -> vec4f {
        return tgpu_effect(uv);
      }"
    `);
    expect(fragment.gl).toMatchInlineSnapshot(`
      "vec4 tgpu_sampleColor(vec2 _pixiUv) {
        return sampleColor(_pixiUv);
      }

      vec4 tgpu_effect(vec2 uv) {
        vec4 color = tgpu_sampleColor(uv);
        float edge = smoothstep(0.3, 0.8, distance(uv, vec2(0.5)));
        return vec4((color.rgb * (1.0 - (edge * strength))), color.a);
      }

      vec4 effect(vec2 uv) {
        return tgpu_effect(uv);
      }"
    `);
  });

  it('reads the scene depth through helpers PixiJS 3D can find by name', () => {
    const fragment = p3d.effectFragment({
      effect: (uv) => {
        'use gpu';
        const depth = p3d.linearDepth(p3d.sampleDepth(uv));
        return d.vec4f(d.vec3f(depth * 0.01 + std.sin(p3d.time.$)), 1);
      },
    });

    // PixiJS 3D binds the scene depth when the fragment's text calls `sampleDepth(`
    expect(fragment.gpu).toContain('return sampleDepth(_pixiUv);');
    expect(fragment.gl).toContain('return sampleDepth(_pixiUv);');
    expect(fragment.gpu).toContain('global.uTime');
    expect(fragment.gl).toContain('sin(uTime)');
  });

  it("rejects values of a material's shader", () => {
    expect(() =>
      p3d.effectFragment({
        effect: () => {
          'use gpu';
          return d.vec4f(p3d.fragment.albedo.$, 1);
        },
      }),
    ).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:entry
      - fn*:effect(vec2f): [@typegpu/pixi] \`fragment.albedo\` is a value of a material's shader, so a post effect can't read it.]
    `);
  });
});

describe('postEffect', () => {
  const tintUniforms = p3d.uniforms({ tint: d.vec3f, amount: d.f32 });

  const TintEffect = p3d.postEffect({
    stage: 'afterToneMapping',
    uniforms: tintUniforms,
    effect: (uv) => {
      'use gpu';
      const color = p3d.sampleColor(uv);
      return d.vec4f(
        std.mix(color.rgb, color.rgb * tintUniforms.$.tint, tintUniforms.$.amount),
        color.a,
      );
    },
  });

  // `fragment` and `uniforms` are protected in PixiJS 3D
  const internals = (effect: PostEffect) =>
    effect as unknown as {
      fragment: { gpu: string; gl: string };
      uniforms: {
        uniforms: Record<string, unknown>;
        uniformStructures: Record<string, { type: string }>;
      };
    };

  it('creates a PostEffect class', () => {
    const effect = new TintEffect();

    expect(effect).toBeInstanceOf(PostEffect);
    expect(effect.stage).toBe('afterToneMapping');
    expect(effect.inputMips).toBe(false);
    expect(internals(effect).fragment.gpu).toContain('fn effect(uv: vec2f) -> vec4f');
    expect(internals(effect).fragment.gl).toContain('vec4 effect(vec2 uv)');
  });

  it('lets an instance pick its own stage', () => {
    expect(new TintEffect({ stage: 'beforeToneMapping' }).stage).toBe('beforeToneMapping');
  });

  it('declares its uniforms the way PixiJS 3D reads them', () => {
    const { uniforms } = internals(new TintEffect());

    expect(uniforms.uniformStructures.tint?.type).toBe('vec3<f32>');
    expect(uniforms.uniformStructures.amount?.type).toBe('f32');
    expect(uniforms.uniforms).toStrictEqual({ tint: new Float32Array(3), amount: 0 });
  });

  it('takes initial values, and typed writes afterwards', () => {
    const effect = new TintEffect({ uniforms: { tint: d.vec3f(1, 0.5, 0), amount: 0.25 } });
    const { uniforms } = internals(effect);

    expect(uniforms.uniforms).toStrictEqual({ tint: new Float32Array([1, 0.5, 0]), amount: 0.25 });

    tintUniforms.write(effect, { amount: 1 });
    tintUniforms.write(effect, { tint: [0, 0, 1] });
    expect(uniforms.uniforms).toStrictEqual({ tint: new Float32Array([0, 0, 1]), amount: 1 });
  });

  it('keeps the values of two instances apart', () => {
    const first = new TintEffect({ uniforms: { amount: 0.1 } });
    const second = new TintEffect({ uniforms: { amount: 0.9 } });

    tintUniforms.write(first, { amount: 0.2 });
    expect(internals(first).uniforms.uniforms.amount).toBe(0.2);
    expect(internals(second).uniforms.uniforms.amount).toBe(0.9);
  });
});
