import tgpu from 'typegpu';
import { u32, vec2f } from 'typegpu/data';
import { dot, neg, normalize, select } from 'typegpu/std';
import { intersectLines, rot90ccw, rot90cw } from '../utils.ts';
import { ExternalNormals, externalNormals } from './externalNormals.ts';
import { solveJoin } from './solveJoin.ts';
import { JoinInput, LineControlPoint, LineSegmentOutput } from './types.ts';
import { endCapSlot, joinSlot, startCapSlot } from './slots.ts';

export const polylineVariableWidth = tgpu.fn(
  [LineControlPoint, LineControlPoint, LineControlPoint, LineControlPoint, u32, u32],
  LineSegmentOutput,
)((A, B, C, D, vertexIndex, maxJoinCount) => {
  'use gpu';
  const AB = B.position - A.position;
  const BC = C.position - B.position;
  const DC = C.position - D.position;
  const CB = neg(BC);

  const radiusABDelta = A.radius - B.radius;
  const radiusBCDelta = B.radius - C.radius;
  const radiusCDDelta = C.radius - D.radius;

  // segments where one end completely contains the other are skipped
  // TODO: we should probably render a circle in some cases
  if (dot(BC, BC) <= radiusBCDelta * radiusBCDelta) {
    return { vertexPosition: vec2f(0, 0), w: 1 };
  }

  const isCapB = dot(AB, AB) <= radiusABDelta * radiusABDelta;
  const isCapC = dot(DC, DC) <= radiusCDDelta * radiusCDDelta;

  const eAB = externalNormals(AB, A.radius, B.radius);
  const eBC = externalNormals(BC, B.radius, C.radius);
  const eCB = ExternalNormals({ nL: eBC.nR, nR: eBC.nL });
  const eDC = externalNormals(DC, D.radius, C.radius);

  const joinLimit = dot(eBC.nL, BC);
  const joinB = solveJoin(AB, BC, eAB, eBC, joinLimit, isCapB);
  const joinC = solveJoin(DC, CB, eDC, eCB, -joinLimit, isCapC);
  const d2 = joinB.dL;
  const d3 = joinB.dR;
  const d4 = joinC.dL;
  const d5 = joinC.dR;

  const v2orig = B.position + d2 * B.radius;
  const v3orig = B.position + d3 * B.radius;
  const v4orig = C.position + d4 * C.radius;
  const v5orig = C.position + d5 * C.radius;

  const limL = intersectLines(B.position, v2orig, C.position, v5orig);
  const limR = intersectLines(B.position, v3orig, C.position, v4orig);

  const v2 = select(v2orig, limL.point, limL.valid);
  const v5 = select(v5orig, limL.point, limL.valid);
  const v3 = select(v3orig, limR.point, limR.valid);
  const v4 = select(v4orig, limR.point, limR.valid);

  if (vertexIndex === 0) {
    return { vertexPosition: B.position, w: 1 / B.radius };
  }
  if (vertexIndex === 1) {
    return { vertexPosition: C.position, w: 1 / C.radius };
  }

  const coreVertexIndex = (vertexIndex - 2) & 0b11;
  const joinVertexIndex = (vertexIndex - 2) >> 2;
  let join = JoinInput();
  let isCap = false;
  let shouldJoin = false;

  const normBC = normalize(BC);
  const normCB = neg(normBC);
  const crossL = rot90ccw(normBC);
  const crossR = rot90cw(normBC);

  // oxfmt-ignore
  if (coreVertexIndex === 0) {
    isCap = isCapB;
    shouldJoin = joinB.shouldJoinL;
    join = JoinInput({
      C: B, v: v2, d: d2, fw: normCB, cross: crossL,
      start: d2,
      end: select(eAB.nL, d3, joinB.isHairpin || isCapB),
    });
  } else if (coreVertexIndex === 1) {
    isCap = isCapB;
    shouldJoin = joinB.shouldJoinR;
    join = JoinInput({
      C: B, v: v3, d: d3, fw: normCB, cross: crossR,
      start: select(eAB.nR, d2, joinB.isHairpin || isCapB),
      end: d3,
    });
  } else if (coreVertexIndex === 2) {
    isCap = isCapC;
    shouldJoin = joinC.shouldJoinL;
    join = JoinInput({
      C: C, v: v4, d: d4, fw: normBC, cross: crossR,
      start: d4,
      end: select(eDC.nL, d5, joinC.isHairpin || isCapC),
    });
  } else {
    isCap = isCapC;
    shouldJoin = joinC.shouldJoinR;
    join = JoinInput({
      C: C, v: v5, d: d5, fw: normBC, cross: crossL,
      start: select(eDC.nR, d4, joinC.isHairpin || isCapC),
      end: d5,
    });
  }

  let vertexPosition = vec2f(join.v);
  if (isCap) {
    if (coreVertexIndex < 2) {
      vertexPosition = startCapSlot.$(join, joinVertexIndex, maxJoinCount);
    } else {
      vertexPosition = endCapSlot.$(join, joinVertexIndex, maxJoinCount);
    }
  } else if (shouldJoin) {
    vertexPosition = joinSlot.$(join, joinVertexIndex, maxJoinCount);
  }

  // TODO: adjust for reverse miter
  const w = select(1 / B.radius, 1 / C.radius, coreVertexIndex >= 2);

  return { vertexPosition, w };
});
