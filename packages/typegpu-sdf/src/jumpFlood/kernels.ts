import { tgpu } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

/** Kernels shared by the `jumpFlood` module. Not part of the public API. */

const INVALID_COORD = 0xffff;

export const floodReadView = /*#__PURE__*/ d.textureStorage2d('rgba16uint', 'read-only');
export const floodWriteView = /*#__PURE__*/ d.textureStorage2d('rgba16uint', 'write-only');
export const sdfWriteView = /*#__PURE__*/ d.textureStorage2d('rgba16float', 'write-only');
export const colorWriteView = /*#__PURE__*/ d.textureStorage2d('rgba8unorm', 'write-only');

/**
 * One bind group per flood step: the textures it reads from and writes to, and the step's offset.
 * The offset lives here (not in a single uniform rewritten between steps), so every step can be
 * recorded into one pass without queue writes.
 */
export const pingPongLayout = /*#__PURE__*/ tgpu.bindGroupLayout({
  readView: { storageTexture: floodReadView },
  writeView: { storageTexture: floodWriteView },
  offset: { uniform: d.i32 },
});

export const initLayout = /*#__PURE__*/ tgpu.bindGroupLayout({
  writeView: { storageTexture: floodWriteView },
});

export const distWriteLayout = /*#__PURE__*/ tgpu.bindGroupLayout({
  sdfTexture: { storageTexture: sdfWriteView },
  colorTexture: { storageTexture: colorWriteView },
});

export const finalizeReadLayout = /*#__PURE__*/ tgpu.bindGroupLayout({
  readView: { storageTexture: floodReadView },
});

/**
 * Slot for the classify function that determines which pixels are "inside" for the SDF.
 * The function receives the pixel coordinate and texture size, and returns whether
 * the pixel is inside (true) or outside (false).
 */
export const classifySlot = /*#__PURE__*/ tgpu.slot<(coord: d.v2u, size: d.v2u) => boolean>();

/** Slot for SDF getter - returns the signed distance value to store. */
export const sdfSlot =
  /*#__PURE__*/ tgpu.slot<
    (coord: d.v2u, size: d.v2u, signedDist: number, insidePx: d.v2u, outsidePx: d.v2u) => number
  >();

/** Slot for color getter - returns the color value to store. */
export const colorSlot =
  /*#__PURE__*/ tgpu.slot<
    (coord: d.v2u, size: d.v2u, signedDist: number, insidePx: d.v2u, outsidePx: d.v2u) => d.v4f
  >();

const sampleWithOffset = (
  tex: d.textureStorage2d<'rgba16uint', 'read-only'>,
  dims: d.v2u,
  pos: d.v2i,
  offset: d.v2i,
) => {
  'use gpu';
  const samplePos = pos.add(offset);

  const outOfBounds =
    samplePos.x < 0 ||
    samplePos.y < 0 ||
    samplePos.x >= d.i32(dims.x) ||
    samplePos.y >= d.i32(dims.y);

  if (outOfBounds) {
    return d.vec4u(INVALID_COORD);
  }

  return std.textureLoad(tex, samplePos);
};

export const initFromSeedCompute = /*#__PURE__*/ tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  const size = std.textureDimensions(initLayout.$.writeView);
  if (gid.x >= size.x || gid.y >= size.y) {
    return;
  }

  // Use classify slot to determine if this pixel is inside
  const isInside = classifySlot.$(gid.xy, size);
  const invalid = d.vec2u(INVALID_COORD);

  // Store pixel coords directly (not UVs)
  // If inside: inside coord = this pixel, outside coord = invalid
  // If outside: outside coord = this pixel, inside coord = invalid
  const insideCoord = std.select(invalid, gid.xy, isInside);
  const outsideCoord = std.select(gid.xy, invalid, isInside);

  std.textureStore(initLayout.$.writeView, d.vec2i(gid.xy), d.vec4u(insideCoord, outsideCoord));
});

export const jumpFloodCompute = /*#__PURE__*/ tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const size = std.textureDimensions(pingPongLayout.$.readView);
  if (gid.x >= size.x || gid.y >= size.y) {
    return;
  }

  const offset = pingPongLayout.$.offset;
  const pos = d.vec2i(gid.xy);

  const invalid = d.vec2u(INVALID_COORD);
  let bestInsideCoord = d.vec2u(invalid);
  let bestOutsideCoord = d.vec2u(invalid);

  let bestInsideDist2 = d.i32(2147483647);
  let bestOutsideDist2 = d.i32(2147483647);

  for (const dy of tgpu.unroll([-1, 0, 1])) {
    for (const dx of tgpu.unroll([-1, 0, 1])) {
      const sample = sampleWithOffset(
        pingPongLayout.$.readView,
        size,
        pos,
        d.vec2i(dx, dy) * offset,
      );

      if (sample.x !== INVALID_COORD) {
        const deltaIn = pos - d.vec2i(sample.xy);
        const dist2 = deltaIn.x * deltaIn.x + deltaIn.y * deltaIn.y;

        if (dist2 < bestInsideDist2) {
          bestInsideDist2 = dist2;
          bestInsideCoord = d.vec2u(sample.xy);
        }
      }

      if (sample.z !== INVALID_COORD) {
        const deltaOut = pos - d.vec2i(sample.zw);
        const dist2 = deltaOut.x * deltaOut.x + deltaOut.y * deltaOut.y;

        if (dist2 < bestOutsideDist2) {
          bestOutsideDist2 = dist2;
          bestOutsideCoord = d.vec2u(sample.zw);
        }
      }
    }
  }

  std.textureStore(
    pingPongLayout.$.writeView,
    d.vec2i(gid.xy),
    d.vec4u(bestInsideCoord, bestOutsideCoord),
  );
});

// Runs a final JFA pass at offset=1 and immediately computes the signed distance
export const finalizeCompute = /*#__PURE__*/ tgpu.computeFn({
  workgroupSize: [8, 8],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  const size = std.textureDimensions(finalizeReadLayout.$.readView);
  if (gid.x >= size.x || gid.y >= size.y) {
    return;
  }

  const pos = d.vec2i(gid.xy);
  const invalid = d.vec2u(INVALID_COORD);
  let bestInsideCoord = d.vec2u(invalid);
  let bestOutsideCoord = d.vec2u(invalid);
  let bestInsideDist2 = d.i32(2147483647);
  let bestOutsideDist2 = d.i32(2147483647);

  for (const dy of tgpu.unroll([-1, 0, 1])) {
    for (const dx of tgpu.unroll([-1, 0, 1])) {
      const sample = sampleWithOffset(finalizeReadLayout.$.readView, size, pos, d.vec2i(dx, dy));

      if (sample.x !== INVALID_COORD) {
        const deltaIn = pos - d.vec2i(sample.xy);
        const dist2 = deltaIn.x * deltaIn.x + deltaIn.y * deltaIn.y;

        if (dist2 < bestInsideDist2) {
          bestInsideDist2 = dist2;
          bestInsideCoord = d.vec2u(sample.xy);
        }
      }

      if (sample.z !== INVALID_COORD) {
        const deltaOut = pos - d.vec2i(sample.zw);
        const dist2 = deltaOut.x * deltaOut.x + deltaOut.y * deltaOut.y;

        if (dist2 < bestOutsideDist2) {
          bestOutsideDist2 = dist2;
          bestOutsideCoord = d.vec2u(sample.zw);
        }
      }
    }
  }

  const posF = d.vec2f(gid.xy);
  let insideDist = d.f32(3.4 * 10 ** 38);
  let outsideDist = d.f32(3.4 * 10 ** 38);

  if (bestInsideCoord.x !== INVALID_COORD) {
    insideDist = std.distance(posF, d.vec2f(bestInsideCoord));
  }

  if (bestOutsideCoord.x !== INVALID_COORD) {
    outsideDist = std.distance(posF, d.vec2f(bestOutsideCoord));
  }

  const signedDist = insideDist - outsideDist;
  const sdfValue = sdfSlot.$(gid.xy, size, signedDist, bestInsideCoord, bestOutsideCoord);
  const colorValue = colorSlot.$(gid.xy, size, signedDist, bestInsideCoord, bestOutsideCoord);

  std.textureStore(distWriteLayout.$.sdfTexture, d.vec2i(gid.xy), d.vec4f(sdfValue, 0, 0, 0));
  std.textureStore(distWriteLayout.$.colorTexture, d.vec2i(gid.xy), colorValue);
});
