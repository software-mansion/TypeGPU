import { randf } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';
import {
  CLOUD_AMPLITUDE,
  CLOUD_BRIGHT,
  CLOUD_COVERAGE,
  CLOUD_DARK,
  CLOUD_FREQUENCY,
  FBM_LACUNARITY,
  FBM_OCTAVES,
  FBM_PERSISTENCE,
  LIGHT_ABSORPTION,
  NOISE_TEXTURE_SIZE,
  NOISE_Z_OFFSET,
  SKY_AMBIENT,
  SUN_BRIGHTNESS,
  SUN_COLOR,
} from './consts.ts';
import { cloudsLayout } from './types.ts';

const sampleDensity = tgpu.fn([d.vec3f], d.f32)((pos) => {
  const coverage = CLOUD_COVERAGE - std.abs(pos.y) * 0.25;
  return std.saturate(fbm(pos) + coverage) - 0.5;
});

const sampleDensityCheap = (pos: d.v3f): number => {
  'use gpu';
  const noise = noise3d(pos * CLOUD_FREQUENCY) * CLOUD_AMPLITUDE;
  return std.saturate(noise + CLOUD_COVERAGE - 0.5);
};

export const raymarch = tgpu.fn([d.vec3f, d.vec3f, d.vec3f], d.vec4f)(
  (rayOrigin, rayDir, sunDir) => {
    'use gpu';
    let accum = d.vec4f();

    const params = cloudsLayout.$.params;
    const maxSteps = params.maxSteps;
    const maxDepth = params.maxDistance;

    const stepSize = 1 / maxSteps;
    let dist = randf.sample() * stepSize;

    for (let i = 0; i < maxSteps; i++) {
      const samplePos = rayOrigin + rayDir * dist * maxDepth;
      const cloudDensity = sampleDensity(samplePos);

      if (cloudDensity > 0.0) {
        const shadowPos = samplePos + sunDir;
        const shadowDensity = sampleDensityCheap(shadowPos);
        const shadow = std.saturate(cloudDensity - shadowDensity);
        const lightVal = std.mix(0.3, 1.0, shadow);

        const light = SKY_AMBIENT * 1.1 +
          SUN_COLOR * lightVal * SUN_BRIGHTNESS;
        const color = std.mix(CLOUD_BRIGHT, CLOUD_DARK, cloudDensity);
        const lit = color * light;

        const contrib = d.vec4f(lit, 1) * cloudDensity *
          (LIGHT_ABSORPTION - accum.a);
        accum += contrib;

        if (accum.a >= LIGHT_ABSORPTION - 0.001) {
          break;
        }
      }
      dist += stepSize;
    }
    return accum;
  },
);

const fbm = tgpu.fn([d.vec3f], d.f32)((pos) => {
  'use gpu';
  let sum = d.f32();
  let amp = d.f32(CLOUD_AMPLITUDE);
  let freq = d.f32(CLOUD_FREQUENCY);

  for (let i = 0; i < FBM_OCTAVES; i++) {
    sum += noise3d(pos * freq) * amp;
    amp *= FBM_PERSISTENCE;
    freq *= FBM_LACUNARITY;
  }
  return sum;
});

const noise3d = tgpu.fn([d.vec3f], d.f32)((pos) => {
  'use gpu';
  const idx = std.floor(pos);
  const frac = std.fract(pos);
  const smooth = frac * frac * (3 - 2 * frac);

  const texCoord0 = std.fract(
    (idx.xy + frac.xy + NOISE_Z_OFFSET * idx.z) / NOISE_TEXTURE_SIZE,
  );
  const texCoord1 = std.fract(
    (idx.xy + frac.xy + NOISE_Z_OFFSET * (idx.z + 1)) / NOISE_TEXTURE_SIZE,
  );

  const val0 = std.textureSampleLevel(
    cloudsLayout.$.noiseTexture,
    cloudsLayout.$.sampler,
    texCoord0,
    0,
  ).x;

  const val1 = std.textureSampleLevel(
    cloudsLayout.$.noiseTexture,
    cloudsLayout.$.sampler,
    texCoord1,
    0,
  ).x;

  return std.mix(val0, val1, smooth.z) * 2 - 1;
});
