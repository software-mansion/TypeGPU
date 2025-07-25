import tgpu from 'typegpu';
import { f32, vec2f } from 'typegpu/data';
import { abs, add, length, max, min, sub } from 'typegpu/std';

/**
 * Signed distance function for a disk (filled circle)
 * @param p Point to evaluate
 * @param radius Radius of the disk
 */
export const sdDisk = tgpu.fn([vec2f, f32], f32)((p, radius) => {
  return length(p) - radius;
});

/**
 * Signed distance function for a 2d box
 * @param p Point to evaluate
 * @param size Half-dimensions of the box
 */
export const sdBox2d = tgpu.fn([vec2f, vec2f], f32)((p, size) => {
  const d = sub(abs(p), size);
  return length(max(d, vec2f(0))) + min(max(d.x, d.y), 0);
});

/**
 * Signed distance function for a rounded 2d box
 * @param p Point to evaluate
 * @param size Half-dimensions of the box
 * @param cornerRadius Box corner radius
 */
export const sdRoundedBox2d = tgpu
  .fn([vec2f, vec2f, f32], f32)((p, size, cornerRadius) => {
    const d = add(sub(abs(p), size), vec2f(cornerRadius));
    return length(max(d, vec2f(0))) + min(max(d.x, d.y), 0) - cornerRadius;
  });
