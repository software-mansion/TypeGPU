export const MAX_STEPS = 48;
export const MAX_DIST = 5;
export const SURF_DIST = 0.001;
export const PI = Math.PI;
export const BLUR_RADIUS = 8;
export const TAA_BLEND = 0.85;

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
