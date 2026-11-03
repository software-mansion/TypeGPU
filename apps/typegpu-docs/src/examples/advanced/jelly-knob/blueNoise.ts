/**
 * GPU-side blue noise, vendored from `packages/core/src/gpu/kit/noise.ts` in
 * https://github.com/shader-effects-inc/shaders (commit b669017), written by Simon Le Marchant.
 * The hash comes from the Fi-hash noise family by @lumiey.
 *
 * Copyright (c) 2026 Shader Effects Inc. Licensed under the MIT License.
 */
import { d, std } from 'typegpu';

// float(~0u), used to normalize hashes into [0, 1]
const U32_MAX = d.f32(4294967295);

/**
 * White noise, vec2 → [0, 1]. Reinterprets the float bits of `p` as integers,
 * relying on wrapping u32 multiplication. GPU-only, as JS numbers don't wrap like u32 does.
 */
export function hash12(p: d.v2f): number {
  'use gpu';
  const u = std.bitcast(d.vec2f, d.vec2u)(p * d.vec2f(141421356, 2718281828));
  return d.f32((u.x ^ u.y) * d.u32(3141592653)) / U32_MAX;
}

/**
 * Pixel-space blue noise, made by high-pass filtering white noise over the 3×3 neighborhood.
 * Expects floored pixel coordinates, returns values in roughly [0, 1].
 */
export function blue12(p: d.v2f): number {
  'use gpu';
  let sum = d.f32(0);
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      sum += hash12(p + d.vec2f(x, y));
    }
  }
  return 0.9 * (1.125 * hash12(p) - sum / 8) + 0.5;
}
