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

const sampleDensityCheap = tgpu.fn([d.vec3f], d.f32)((pos) => {
  const noise = noise3d(std.mul(pos, CLOUD_FREQUENCY)) * CLOUD_AMPLITUDE;
  return std.clamp(noise + CLOUD_COVERAGE - 0.5, 0.0, 1.0);
});

export const raymarch = tgpu.fn([d.vec3f, d.vec3f, d.vec3f], d.vec4f)(
  (rayOrigin, rayDir, sunDir) => {
    let accum = d.vec4f();

    const params = cloudsLayout.$.params;
    const maxSteps = params.maxSteps;
    const maxDepth = params.maxDistance;

    const stepSize = 1 / maxSteps;
    let dist = randf.sample() * stepSize;

    for (let i = 0; i < maxSteps; i++) {
      const samplePos = std.add(rayOrigin, std.mul(rayDir, dist * maxDepth));
      const cloudDensity = sampleDensity(samplePos);

      if (cloudDensity > 0.0) {
        const shadowPos = std.add(samplePos, sunDir);
        const shadowDensity = sampleDensityCheap(shadowPos);
        const shadow = std.clamp(cloudDensity - shadowDensity, 0.0, 1.0);
        const lightVal = std.mix(0.3, 1.0, shadow);

        const light = std.add(
          std.mul(SKY_AMBIENT, 1.1),
          std.mul(SUN_COLOR, lightVal * SUN_BRIGHTNESS),
        );
        const color = std.mix(CLOUD_BRIGHT, CLOUD_DARK, cloudDensity);
        const lit = std.mul(color, light);

        const contrib = std.mul(
          d.vec4f(lit, 1),
          cloudDensity * (LIGHT_ABSORPTION - accum.a),
        );
        accum = std.add(accum, contrib);

        if (accum.a >= LIGHT_ABSORPTION - 0.001) {
          break;
        }
      }
      dist += stepSize;
    }
    return accum;
  },
);

const iterations = Array.from({ length: FBM_OCTAVES }, (_, i) => i);
const fbm = tgpu.fn([d.vec3f], d.f32)((pos) => {
  let sum = d.f32();
  let amp = d.f32(CLOUD_AMPLITUDE);
  let freq = d.f32(CLOUD_FREQUENCY);

  for (const _i of tgpu.unroll(iterations)) {
    sum += noise3d(std.mul(pos, freq)) * amp;
    amp *= FBM_PERSISTENCE;
    freq *= FBM_LACUNARITY;
  }
  return sum;
});

const noise3d = tgpu.fn([d.vec3f], d.f32)((pos) => {
  const idx = std.floor(pos);
  const frac = std.fract(pos);
  const smooth = std.mul(std.mul(frac, frac), std.sub(3.0, std.mul(2.0, frac)));

  const texCoord0 = std.fract(
    std.div(
      std.add(std.add(idx.xy, frac.xy), std.mul(NOISE_Z_OFFSET, idx.z)),
      NOISE_TEXTURE_SIZE,
    ),
  );
  const texCoord1 = std.fract(
    std.div(
      std.add(
        std.add(idx.xy, frac.xy),
        std.mul(NOISE_Z_OFFSET, std.add(idx.z, 1.0)),
      ),
      NOISE_TEXTURE_SIZE,
    ),
  );

  const val0 = std.textureSampleLevel(
    cloudsLayout.$.noiseTexture,
    cloudsLayout.$.sampler,
    texCoord0,
    0.0,
  ).x;

  const val1 = std.textureSampleLevel(
    cloudsLayout.$.noiseTexture,
    cloudsLayout.$.sampler,
    texCoord1,
    0.0,
  ).x;

  return std.mix(val0, val1, smooth.z) * 2.0 - 1.0;
});
