import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { textureSample } from '../../../src/std/texture.ts';
import { fn } from '../../../src/core/function/tgpuFn.ts';
import * as d from '../../../src/data/index.ts';
import { sampler } from '../../../src/core/sampler/sampler.ts';

describe('textureSample', () => {
  it('does not allow for raw schemas to be passed in', ({ root }) => {
    expect(() => {
      const linSampler = sampler({
        minFilter: 'linear',
        magFilter: 'linear',
      });
      const someTexture = root['~unstable'].createTexture({
        size: [256, 256],
        format: 'rgba8unorm',
      }).$usage('sampled');
      const sampledView = someTexture.createView(d.texture2d());

      const validFn = fn([], d.vec4f)(() =>
        textureSample(sampledView.$, linSampler, d.vec2f(0.5))
      );

      const invalidFn = fn([], d.vec4f)(() =>
        // @ts-expect-error
        textureSample(d.texture2d(), linSampler, d.vec2f(0.5))
      );
    });
  });
});
