export const MAX_STEPS = 128;
export const MAX_DIST = 40;
export const SURF_DIST = 0.001;
export const PI = Math.PI;
export const LIGHT_COUNT = 2;
export const BLUR_RADIUS = 16;
export const TAA_BLEND = 0.8;
export const SHADOW_SOFTNESS = 8;

export const CUBEMAP_SIZE = 512;

export function halton(index: number, base: number): number {
  let result = 0;
  let f = 1 / base;
  let i = index;
  while (i > 0) {
    result += f * (i % base);
    i = Math.floor(i / base);
    f /= base;
  }
  return result;
}
