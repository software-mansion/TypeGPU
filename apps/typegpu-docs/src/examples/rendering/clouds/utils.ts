import { randf } from '@typegpu/noise';
import { tgpu, d, std } from 'typegpu';
import {
  CLOUD_AMPLITUDE,
  CLOUD_BRIGHT,
  CLOUD_COVERAGE,
  CLOUD_DARK,
  CLOUD_EXTINCTION,
  CLOUD_FREQUENCY,
  DENSITY_TEXTURE_SIZE,
  FBM_LACUNARITY,
  FBM_OCTAVES,
  FBM_PERSISTENCE,
  LIGHT_ABSORPTION,
  NOISE_TEXTURE_SIZE,
  NOISE_Z_OFFSET,
  SKY_AMBIENT,
  SUN_BRIGHTNESS,
  SUN_COLOR,
  SUN_DIRECTION,
} from './consts.ts';
import { cloudsLayout, precomputeDensityLayout } from './types.ts';

const FBM_MAX_AMPLITUDE =
  (CLOUD_AMPLITUDE * (1 - FBM_PERSISTENCE ** FBM_OCTAVES)) / (1 - FBM_PERSISTENCE);

const DENSITY_WORLD_PERIOD = NOISE_TEXTURE_SIZE / CLOUD_FREQUENCY;

const noise3d = tgpu.fn(
  [d.vec3f],
  d.f32,
)((pos) => {
  'use gpu';
  const idx = std.floor(pos);
  const frac = std.fract(pos);
  const smooth = frac * frac * (3 - 2 * frac);

  const texCoord0 = std.fract((idx.xy + frac.xy + NOISE_Z_OFFSET * idx.z) / NOISE_TEXTURE_SIZE);
  const texCoord1 = std.fract(
    (idx.xy + frac.xy + NOISE_Z_OFFSET * (idx.z + 1)) / NOISE_TEXTURE_SIZE,
  );

  const val0 = std.textureSampleLevel(
    precomputeDensityLayout.$.noiseTexture,
    precomputeDensityLayout.$.sampler,
    texCoord0,
    0,
  ).x;

  const val1 = std.textureSampleLevel(
    precomputeDensityLayout.$.noiseTexture,
    precomputeDensityLayout.$.sampler,
    texCoord1,
    0,
  ).x;

  return std.mix(val0, val1, smooth.z) * 2 - 1;
});

const fbm = tgpu.fn(
  [d.vec3f],
  d.f32,
)((pos) => {
  'use gpu';
  let sum = d.f32();

  for (const i of tgpu.unroll(std.range(FBM_OCTAVES))) {
    sum +=
      noise3d(pos * (CLOUD_FREQUENCY * FBM_LACUNARITY ** i)) *
      (CLOUD_AMPLITUDE * FBM_PERSISTENCE ** i);
  }

  return sum;
});

const packF32ToTwo8unorm = tgpu.fn(
  [d.f32],
  d.vec2f,
)((value) => {
  'use gpu';
  const normalized = std.saturate(value / (2 * FBM_MAX_AMPLITUDE) + 0.5);
  const quantized = d.u32(std.floor(normalized * 65535));
  const low = quantized & 0xff;
  // TODO: replace with >>>
  const high = quantized >> 8;
  return d.vec2f(high, low) / 255;
});

const unpackTwo8unormToF32 = tgpu.fn(
  [d.vec2f],
  d.f32,
)((encoded) => {
  'use gpu';
  const normalized = (encoded.x * 256 + encoded.y) / 257;
  return (normalized * 2 - 1) * FBM_MAX_AMPLITUDE;
});

export const precomputeDensity = (x: number, y: number, z: number) => {
  'use gpu';
  const uvw = (d.vec3f(x, y, z) + 0.5) / DENSITY_TEXTURE_SIZE;
  const worldPos = uvw * DENSITY_WORLD_PERIOD;

  const fbmValue = fbm(worldPos);
  const shadowFbmValue = fbm(worldPos + std.normalize(SUN_DIRECTION));
  const packedFbm = packF32ToTwo8unorm(fbmValue);
  const packedShadowFbm = packF32ToTwo8unorm(shadowFbmValue);

  std.textureStore(
    precomputeDensityLayout.$.densityTexture,
    d.vec3u(x, y, z),
    d.vec4f(packedFbm, packedShadowFbm),
  );
};

const sampleDensityVolume = tgpu.fn(
  [d.vec3f],
  d.vec2f,
)((pos) => {
  'use gpu';
  const uvw = std.fract(pos / DENSITY_WORLD_PERIOD);
  const sampled = std.textureSampleLevel(
    cloudsLayout.$.densityTexture,
    cloudsLayout.$.sampler,
    uvw,
    0,
  );

  return d.vec2f(unpackTwo8unormToF32(sampled.xy), unpackTwo8unormToF32(sampled.zw));
});

const sampleDensities = tgpu.fn(
  [d.vec3f],
  d.vec2f,
)((pos) => {
  'use gpu';
  const fbmValues = sampleDensityVolume(pos);
  const coverage = CLOUD_COVERAGE - std.abs(pos.y) * 0.25;
  const cloudDensity = std.saturate(fbmValues.x + coverage) - 0.5;
  const shadowDensity = std.saturate(fbmValues.y + coverage) - 0.5;
  return d.vec2f(cloudDensity, shadowDensity);
});

export const raymarch = tgpu.fn(
  [d.vec3f, d.vec3f],
  d.vec4f,
)((rayOrigin, rayDir) => {
  'use gpu';
  let accum = d.vec4f();

  const params = cloudsLayout.$.params;
  const maxSteps = params.maxSteps;
  const maxDepth = params.maxDistance;

  const stepSize = 1 / maxSteps;
  const stepLength = maxDepth / maxSteps;
  let dist = randf.sample() * stepSize;

  for (let i = 0; i < maxSteps; i++) {
    const samplePos = rayOrigin + rayDir * dist * maxDepth;
    const densities = sampleDensities(samplePos);
    const cloudDensity = densities.x;

    if (cloudDensity > 0.0) {
      const shadowDensity = densities.y;
      const shadow = std.saturate(cloudDensity - shadowDensity);
      const lightVal = std.mix(0.3, 1.0, shadow);

      const light = SKY_AMBIENT * 1.1 + SUN_COLOR * lightVal * SUN_BRIGHTNESS;
      const color = std.mix(CLOUD_BRIGHT, CLOUD_DARK, cloudDensity);
      const lit = color * light;

      const sampleOpacity = 1 - std.exp(-cloudDensity * CLOUD_EXTINCTION * stepLength);
      const weight = sampleOpacity * (LIGHT_ABSORPTION - accum.a);
      const contrib = d.vec4f(lit, 1) * weight;
      accum += contrib;

      if (accum.a >= LIGHT_ABSORPTION - 0.001) {
        break;
      }
    }
    dist += stepSize;
  }
  return accum;
});
