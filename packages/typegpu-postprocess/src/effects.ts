import { tgpu, d, std, type TgpuAccessor } from 'typegpu';
import { oneToOnePass, standalonePass, type PassGroup } from './passes.ts';

export interface BlurOptions {
  /** Integer pixel radius, constant or GPU input. Defaults to 2. Dynamic values clamp to [0, 64]. */
  radius?: TgpuAccessor.In<d.I32>;
}

export interface GaussianBlurOptions extends BlurOptions {
  /** Standard deviation in pixels. Defaults to max(radius / 2, 0.5). */
  sigma?: number;
}

function radiusOf(options: BlurOptions): TgpuAccessor<d.I32> {
  const radius = options.radius ?? 2;
  if (typeof radius === 'number' && (!Number.isSafeInteger(radius) || radius < 0 || radius > 64)) {
    throw new Error('Blur radius must be an integer between 0 and 64.');
  }
  return tgpu.accessor(d.i32, radius);
}

function blur(radiusAccess: TgpuAccessor<d.I32>, sigma: number | 'auto' | undefined) {
  return standalonePass({
    callback: (input, uv) => {
      'use gpu';
      const radius = std.clamp(radiusAccess.$, 0, 64);
      const size = d.vec2i(std.textureDimensions(input));
      const center = d.vec2i(uv * d.vec2f(size));
      let sum = d.vec4f(0);
      let total = d.f32(0);
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          let weight = d.f32(1);
          if (sigma !== undefined) {
            let deviation = std.max(d.f32(radius) / 2, 0.5);
            if (sigma !== 'auto') {
              deviation = sigma;
            }
            weight = std.exp(-d.f32(x * x + y * y) / (2 * deviation * deviation));
          }
          const pixel = std.clamp(center + d.vec2i(x, y), d.vec2i(0), size - d.vec2i(1));
          sum += std.textureLoad(input, pixel, 0) * weight;
          total += weight;
        }
      }
      return sum / total;
    },
  });
}

/** Normalized square box kernel, with clamp-to-edge boundary handling. */
export function singlePassBoxBlur(options: BlurOptions = {}) {
  return blur(radiusOf(options), undefined);
}

/** Uniform circular aperture convolution in one pass, with clamp-to-edge boundaries. */
export function bokehBlur(options: BlurOptions = {}) {
  const radiusAccess = radiusOf(options);
  return standalonePass({
    callback: (input, uv) => {
      'use gpu';
      const radius = std.clamp(radiusAccess.$, 0, 64);
      const size = d.vec2i(std.textureDimensions(input));
      const center = d.vec2i(uv * d.vec2f(size));
      let sum = d.vec4f(0);
      let total = d.f32(0);
      for (let y = -radius; y <= radius; y++) {
        for (let x = -radius; x <= radius; x++) {
          if (x * x + y * y <= radius * radius) {
            const pixel = std.clamp(center + d.vec2i(x, y), d.vec2i(0), size - d.vec2i(1));
            sum += std.textureLoad(input, pixel, 0);
            total += 1;
          }
        }
      }
      return sum / total;
    },
  });
}

function sigmaOf(options: GaussianBlurOptions): number | 'auto' {
  const sigma = options.sigma;
  if (sigma === undefined) {
    return 'auto';
  }
  const varianceScale = Math.fround(2 * sigma * sigma);
  if (
    !Number.isFinite(sigma) ||
    sigma <= 0 ||
    !Number.isFinite(varianceScale) ||
    varianceScale === 0
  ) {
    throw new Error('Gaussian sigma must be positive with a finite, nonzero f32 variance.');
  }
  return sigma;
}

/** Normalized square Gaussian kernel in one render pass. */
export function singlePassGaussianBlur(options: GaussianBlurOptions = {}) {
  const radius = radiusOf(options);
  return blur(radius, sigmaOf(options));
}

function directionalBlur(
  radiusAccess: TgpuAccessor<d.I32>,
  sigma: number | 'auto' | undefined,
  direction: d.v2i,
) {
  return standalonePass({
    callback: (input, uv) => {
      'use gpu';
      const radius = std.clamp(radiusAccess.$, 0, 64);
      const size = d.vec2i(std.textureDimensions(input));
      const center = d.vec2i(uv * d.vec2f(size));
      let sum = d.vec4f(0);
      let total = d.f32(0);
      for (let offset = -radius; offset <= radius; offset++) {
        let weight = d.f32(1);
        if (sigma !== undefined) {
          let deviation = std.max(d.f32(radius) / 2, 0.5);
          if (sigma !== 'auto') {
            deviation = sigma;
          }
          weight = std.exp(-d.f32(offset * offset) / (2 * deviation * deviation));
        }
        const pixel = std.clamp(center + direction * offset, d.vec2i(0), size - d.vec2i(1));
        sum += std.textureLoad(input, pixel, 0) * weight;
        total += weight;
      }
      return sum / total;
    },
  });
}

function separableBlur(radius: TgpuAccessor<d.I32>, sigma: number | 'auto' | undefined): PassGroup {
  return Object.freeze({
    kind: 'group',
    passes: Object.freeze([
      directionalBlur(radius, sigma, d.vec2i(1, 0)),
      directionalBlur(radius, sigma, d.vec2i(0, 1)),
    ]),
  });
}

/** Horizontal then vertical Gaussian convolution. Following color transforms fuse into the vertical pass. */
export function separableGaussianBlur(options: GaussianBlurOptions = {}): PassGroup {
  const radius = radiusOf(options);
  return separableBlur(radius, sigmaOf(options));
}

/** Horizontal then vertical box convolution, with clamp-to-edge boundaries. */
export function separableBoxBlur(options: BlurOptions = {}): PassGroup {
  return separableBlur(radiusOf(options), undefined);
}

/** Reinhard curve for nonnegative linear HDR RGB. Preserves alpha. */
export function reinhardToneMapping() {
  return oneToOnePass((input) => {
    'use gpu';
    const color = std.max(input.rgb, d.vec3f(0));
    return d.vec4f(color / (color + d.vec3f(1)), input.a);
  });
}

/** Narkowicz ACES filmic approximation, applied to linear RGB. Preserves alpha. */
export function acesToneMapping() {
  return oneToOnePass((input) => {
    'use gpu';
    const x = std.max(input.rgb, d.vec3f(0));
    const mapped = (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14);
    return d.vec4f(std.clamp(mapped, d.vec3f(0), d.vec3f(1)), input.a);
  });
}

/** Exponential exposure curve: 1 - exp(-rgb * exposure). Preserves alpha. */
export function exposureToneMapping(exposure = 1) {
  if (!Number.isFinite(Math.fround(exposure)) || exposure < 0) {
    throw new Error('Exposure must be nonnegative and finite.');
  }
  return oneToOnePass((input) => {
    'use gpu';
    const color = std.max(input.rgb, d.vec3f(0));
    return d.vec4f(d.vec3f(1) - std.exp(color * -exposure), input.a);
  });
}
