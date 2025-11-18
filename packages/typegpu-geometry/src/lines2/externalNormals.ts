import tgpu from 'typegpu';
import { f32, struct, vec2f } from 'typegpu/data';
import { dot, max, sqrt } from 'typegpu/std';

const ExternalNormals = struct({
  /** Normal which is CW (left of) the distance vector */
  nL: vec2f,
  /** Normal which is CCW (right of) the distance vector */
  nR: vec2f,
});

/**
 * Given two circles at a `distance` of radii `r1` and `r2`,
 * computes the two external tangent normals, which correspond to
 * line segment edges.
 *
 * NOTE: for circles with the same radius, this corresponds to
 * normalizing the distance vector and rotating CW (nL) and CCW (nR).
 */
export const externalNormals = tgpu.fn(
  [vec2f, f32, f32],
  ExternalNormals,
)((distance, r1, r2) => {
  // Distance squared inverse is used to avoid taking square root more than necessary.
  // This way we only need to take it once!
  const dist2Inv = 1 / dot(distance, distance);
  const cosMulLen = r1 - r2;
  const cosDivLen = cosMulLen * dist2Inv;
  const sinDivLen = sqrt(max(0, 1 - cosMulLen * cosDivLen) * dist2Inv);
  const a = distance.x * cosDivLen;
  const b = distance.y * sinDivLen;
  const c = distance.x * sinDivLen;
  const d = distance.y * cosDivLen;
  const nL = vec2f(a - b, c + d);
  const nR = vec2f(a + b, -c + d);
  return ExternalNormals({ nL, nR });
});
