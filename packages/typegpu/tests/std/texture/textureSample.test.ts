import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import tgpu, { d } from 'typegpu';
import { textureSample } from 'typegpu/std';

describe('textureSample', () => {
  it('does not allow for raw schemas to be passed in', ({ root }) => {
    expect(() => {
      const linSampler = root.createSampler({
        minFilter: 'linear',
        magFilter: 'linear',
      });
      const someTexture = root
        .createTexture({
          size: [256, 256],
          format: 'rgba8unorm',
        })
        .$usage('sampled');
      const sampledView = someTexture.createView(d.texture2d());

      const someLayout = tgpu.bindGroupLayout({
        sampledCube: { texture: d.textureCube() },
      });

      const validFn = tgpu.fn(
        [],
        d.vec4f,
      )(() => textureSample(sampledView.$, linSampler.$, d.vec2f(0.5)));

      const validFn2 = tgpu.fn(
        [],
        d.vec4f,
      )(() => textureSample(someLayout.$.sampledCube, linSampler.$, d.vec3f(0.5)));

      const invalidFn = tgpu.fn(
        [],
        d.vec4f,
      )(() =>
        // @ts-expect-error
        textureSample(d.texture2d(), linSampler, d.vec2f(0.5)),
      );

      const invalidFn2 = tgpu.fn(
        [],
        d.vec4f,
      )(() =>
        // @ts-expect-error
        textureSample(d.textureCube(), linSampler, d.vec3f(0.5)),
      );
    });
  });
});
