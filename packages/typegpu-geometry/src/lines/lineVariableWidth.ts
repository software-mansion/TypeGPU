import tgpu from 'typegpu';
import { u32, vec2f } from 'typegpu/data';
import { dot, neg, normalize, select } from 'typegpu/std';
import { externalNormals } from './externalNormals.ts';
import { JoinInput, LineControlPoint, LineSegmentOutput } from './types.ts';
import { endCapSlot, startCapSlot } from './slots.ts';
import { rot90ccw, rot90cw } from '../utils.ts';

export const lineVariableWidth = tgpu.fn(
  [LineControlPoint, LineControlPoint, u32, u32],
  LineSegmentOutput,
)((A, B, vertexIndex, maxJoinCount) => {
  'use gpu';
  const AB = B.position - A.position;

  const radiusABDelta = A.radius - B.radius;

  // segments where one end completely contains the other are skipped
  // TODO: we should probably render a circle in some cases
  if (dot(AB, AB) <= radiusABDelta * radiusABDelta) {
    return { vertexPosition: vec2f(0, 0), w: 1 };
  }

  const eAB = externalNormals(AB, A.radius, B.radius);

  const d2 = eAB.nL;
  const d3 = eAB.nR;
  const d4 = eAB.nR;
  const d5 = eAB.nL;

  const v2 = A.position + d2 * A.radius;
  const v3 = A.position + d3 * A.radius;
  const v4 = B.position + d4 * B.radius;
  const v5 = B.position + d5 * B.radius;

  if (vertexIndex === 0) {
    return { vertexPosition: A.position, w: 1 / A.radius };
  }
  if (vertexIndex === 1) {
    return { vertexPosition: B.position, w: 1 / B.radius };
  }

  const coreVertexIndex = (vertexIndex - 2) & 0b11;
  const joinVertexIndex = (vertexIndex - 2) >> 2;
  let join = JoinInput();

  const normAB = normalize(AB);
  const normBA = neg(normAB);
  const crossL = rot90ccw(normAB);
  const crossR = rot90cw(normAB);

  // oxfmt-ignore
  if (coreVertexIndex === 0) {
    join = JoinInput({
      C: A, v: v2, d: d2, fw: normBA, cross: crossL,
      start: d2,
      end: d3,
    });
  } else if (coreVertexIndex === 1) {
    join = JoinInput({
      C: A, v: v3, d: d3, fw: normBA, cross: crossR,
      start: d2,
      end: d3,
    });
  } else if (coreVertexIndex === 2) {
    join = JoinInput({
      C: B, v: v4, d: d4, fw: normAB, cross: crossR,
      start: d4,
      end: d5,
    });
  } else {
    join = JoinInput({
      C: B, v: v5, d: d5, fw: normAB, cross: crossL,
      start: d4,
      end: d5,
    });
  }

  let vertexPosition = vec2f(join.v);
  if (coreVertexIndex < 2) {
    vertexPosition = startCapSlot.$(join, joinVertexIndex, maxJoinCount);
  } else {
    vertexPosition = endCapSlot.$(join, joinVertexIndex, maxJoinCount);
  }

  // TODO: adjust for reverse miter
  const w = select(1 / A.radius, 1 / B.radius, coreVertexIndex >= 2);

  return { vertexPosition, w };
});
