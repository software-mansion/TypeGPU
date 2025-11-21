import tgpu from 'typegpu';
import { u32, vec2f } from 'typegpu/data';
import { dot, neg, select, sub } from 'typegpu/std';
import { intersectLines } from '../lines/utils.ts';
import { addMul } from '../utils.ts';
import { ExternalNormals, externalNormals } from './externalNormals.ts';
import { round } from './joins/round.ts';
import { solveJoin } from './solveJoin.ts';
import { JoinInput, LineControlPoint, LineSegmentOutput } from './types.ts';

export const joinSlot = tgpu.slot(round);
export const startCapSlot = tgpu.slot(round);
export const endCapSlot = tgpu.slot(round);

export const lineSegmentVariableWidth = tgpu.fn(
  [
    u32,
    LineControlPoint,
    LineControlPoint,
    LineControlPoint,
    LineControlPoint,
    u32,
  ],
  LineSegmentOutput,
)((vertexIndex, A, B, C, D, maxJoinCount) => {
  const AB = sub(B.position, A.position);
  const BC = sub(C.position, B.position);
  const DC = sub(C.position, D.position);
  const CB = neg(BC);

  const radiusABDelta = A.radius - B.radius;
  const radiusBCDelta = B.radius - C.radius;
  const radiusCDDelta = C.radius - D.radius;

  // segments where one end completely contains the other are skipped
  // TODO: we should probably render a circle in some cases
  if (dot(BC, BC) <= radiusBCDelta * radiusBCDelta) {
    return {
      vertexPosition: vec2f(0, 0),
      situationIndex: 0,
    };
  }

  const isCapB = dot(AB, AB) <= radiusABDelta * radiusABDelta + 1e-12;
  const isCapC = dot(DC, DC) <= radiusCDDelta * radiusCDDelta + 1e-12;

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

  const v2orig = addMul(B.position, d2, B.radius);
  const v3orig = addMul(B.position, d3, B.radius);
  const v4orig = addMul(C.position, d4, C.radius);
  const v5orig = addMul(C.position, d5, C.radius);

  const limL = intersectLines(B.position, v2orig, C.position, v5orig);
  const limR = intersectLines(B.position, v3orig, C.position, v4orig);

  const v2 = select(v2orig, limL.point, limL.valid);
  const v5 = select(v5orig, limL.point, limL.valid);
  const v3 = select(v3orig, limR.point, limR.valid);
  const v4 = select(v4orig, limR.point, limR.valid);

  const situationIndex = u32(joinB.isHairpin) + u32(joinC.isHairpin);

  if (vertexIndex < 2) {
    return {
      vertexPosition: select(B.position, C.position, vertexIndex === 1),
      situationIndex,
    };
  }

  const joinIndex = (vertexIndex - 2) & 0b11;
  const joinCount = (vertexIndex - 2) >> 2;

  let join = JoinInput();

  // deno-fmt-ignore
  if (joinIndex === 0) {
    join = JoinInput({
      C: B, v: v2, d: d2, shouldJoin: joinB.shouldJoinL, isCap: isCapB, fw: CB,
      start: d2,
      end: select(eAB.nL, d3, joinB.isHairpin || isCapB),
    });
  } else if (joinIndex === 1) {
    join = JoinInput({
      C: B, v: v3, d: d3, shouldJoin: joinB.shouldJoinR, isCap: isCapB, fw: CB,
      start: select(eAB.nR, d2, joinB.isHairpin || isCapB),
      end: d3,
    });
  } else if (joinIndex === 2) {
    join = JoinInput({
      C: C, v: v4, d: d4, shouldJoin: joinC.shouldJoinL, isCap: isCapC, fw: BC,
      start: d4,
      end: select(eDC.nL, d5, joinC.isHairpin || isCapC),
    });
  } else {
    join = JoinInput({
      C: C, v: v5, d: d5, shouldJoin: joinC.shouldJoinR, isCap: isCapC, fw: BC,
      start: select(eDC.nR, d4, joinC.isHairpin || isCapC),
      end: d5,
    });
  }

  let vertexPosition = vec2f(join.v);
  if (join.isCap) {
    if (joinIndex < 2) {
      vertexPosition = startCapSlot.$(join, joinCount, maxJoinCount);
    } else {
      vertexPosition = endCapSlot.$(join, joinCount, maxJoinCount);
    }
  } else if (join.shouldJoin) {
    vertexPosition = joinSlot.$(join, joinCount, maxJoinCount);
  }

  return {
    vertexPosition,
    situationIndex,
  };
});
