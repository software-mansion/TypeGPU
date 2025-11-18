import tgpu from 'typegpu';
import { u32, vec2f } from 'typegpu/data';
import { dot, max, select, sub } from 'typegpu/std';
import { intersectLines, miterPointNoCheck } from '../lines/utils.ts';
import { addMul, bisectCcw, slerpApprox } from '../utils.ts';
import { MITER_DOT_PRODUCT_LIMIT } from './constants.ts';
import { externalNormals } from './externalNormals.ts';
import { LineControlPoint, LineSegmentOutput } from './types.ts';

export const lineSegmentVariableWidth = tgpu.fn(
  [u32, LineControlPoint, LineControlPoint, LineControlPoint, LineControlPoint],
  LineSegmentOutput,
)((vertexIndex, A, B, C, D) => {
  const AB = sub(B.position, A.position);
  const BC = sub(C.position, B.position);
  const CD = sub(D.position, C.position);

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
  const isCapC = dot(CD, CD) <= radiusCDDelta * radiusCDDelta + 1e-12;

  const eAB = externalNormals(AB, A.radius, B.radius);
  const eBC = externalNormals(BC, B.radius, C.radius);
  const eCD = externalNormals(CD, C.radius, D.radius);

  const joinLimit = dot(eBC.nL, BC);

  const underLimitBL = dot(eAB.nL, BC) < joinLimit;
  const underLimitBR = dot(eAB.nR, BC) < joinLimit;
  const isHairpinB = dot(AB, BC) < 0 && underLimitBL === underLimitBR;
  const shouldJoinBL = isHairpinB || underLimitBL &&
      dot(eAB.nL, eBC.nL) < MITER_DOT_PRODUCT_LIMIT;
  const shouldJoinBR = isHairpinB || underLimitBR &&
      dot(eAB.nR, eBC.nR) < MITER_DOT_PRODUCT_LIMIT;

  let d2 = vec2f(eBC.nL);
  if (!isCapB && !shouldJoinBL) {
    d2 = miterPointNoCheck(eAB.nL, eBC.nL);
  }
  let d3 = vec2f(eBC.nR);
  if (!isCapB && !shouldJoinBR) {
    d3 = miterPointNoCheck(eBC.nR, eAB.nR);
  }

  const underLimitCR = dot(eCD.nR, BC) > joinLimit;
  const underLimitCL = dot(eCD.nL, BC) > joinLimit;
  const isHairpinC = dot(BC, CD) < 0 && underLimitCR === underLimitCL;
  const shouldJoinCR = isHairpinC || underLimitCR &&
      dot(eBC.nR, eCD.nR) < MITER_DOT_PRODUCT_LIMIT;
  const shouldJoinCL = isHairpinC || underLimitCL &&
      dot(eBC.nL, eCD.nL) < MITER_DOT_PRODUCT_LIMIT;

  let d4 = vec2f(eBC.nR);
  if (!isCapC && !shouldJoinCR) {
    d4 = miterPointNoCheck(eCD.nR, eBC.nR);
  }
  let d5 = vec2f(eBC.nL);
  if (!isCapC && !shouldJoinCL) {
    d5 = miterPointNoCheck(eBC.nL, eCD.nL);
  }

  const situationIndex = max(
    u32(shouldJoinBL) + u32(shouldJoinBR) +
      u32(shouldJoinBL && shouldJoinBR && isHairpinB),
    u32(shouldJoinCL) + u32(shouldJoinCR) +
      u32(shouldJoinCL && shouldJoinCR && isHairpinC),
  );

  let v2 = addMul(B.position, d2, B.radius);
  let v3 = addMul(B.position, d3, B.radius);
  let v4 = addMul(C.position, d4, C.radius);
  let v5 = addMul(C.position, d5, C.radius);

  const limL = intersectLines(B.position, v2, C.position, v5);
  const limR = intersectLines(B.position, v3, C.position, v4);
  v2 = select(v2, vec2f(limL.point), limL.valid);
  v5 = select(v5, vec2f(limL.point), limL.valid);
  v3 = select(v3, vec2f(limR.point), limR.valid);
  v4 = select(v4, vec2f(limR.point), limR.valid);

  if (vertexIndex < 6) {
    const points = [B.position, C.position, v2, v3, v4, v5];
    return {
      // biome-ignore lint/style/noNonNullAssertion: trust me bro
      vertexPosition: points[vertexIndex]!,
      situationIndex,
    };
  }

  const joinIndex = (vertexIndex - 6) & 0b11;
  const joinCount = (vertexIndex - 6) >> 2;
  const MAX_COUNT = 3;
  let side = LineControlPoint(B);
  if (joinIndex >= 2) {
    side = LineControlPoint(C);
  }
  const joins = [
    [v2, d2, d2, select(eAB.nL, d3, isHairpinB)],
    [v3, d3, select(eAB.nR, d2, isHairpinB), d3],
    [v4, d4, d4, select(eCD.nR, d5, isHairpinC)],
    [v5, d5, select(eCD.nL, d4, isHairpinC), d5],
  ] as const;
  const shouldJoins = [
    shouldJoinBL,
    shouldJoinBR,
    shouldJoinCR,
    shouldJoinCL,
  ] as const;

  // biome-ignore lint/style/noNonNullAssertion: trust me bro
  const join = joins[joinIndex]!;
  // biome-ignore lint/style/noNonNullAssertion: trust me bro
  const shouldJoin = shouldJoins[joinIndex]!;
  let vertexPosition = vec2f(join[0]);
  if (shouldJoin) {
    const dir = slerpApprox(
      join[1],
      bisectCcw(join[2], join[3]),
      (joinCount + 1) / MAX_COUNT,
    );
    vertexPosition = addMul(side.position, dir, side.radius);
  }
  return {
    vertexPosition,
    situationIndex,
  };
});
