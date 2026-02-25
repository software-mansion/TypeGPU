import tgpu from 'typegpu';
import { struct, u32, vec2f } from 'typegpu/data';
import type { v2f } from 'typegpu/data';
import { dot, mul, normalize, sub } from 'typegpu/std';
import { addMul, midPoint, rot90ccw, rot90cw } from '../utils.ts';
import { externalNormals, limitTowardsMiddle, miterPoint } from './utils.ts';
import { JoinPath, LineSegmentVertex } from './types.ts';
import { joinSituationIndex } from './joins/common.ts';
import { roundJoin } from './joins/round.ts';
import { roundCap } from './caps/round.ts';
import { JOIN_LIMIT } from './constants.ts';

export const joinSlot = tgpu.slot(roundJoin);
export const startCapSlot = tgpu.slot(roundCap);
export const endCapSlot = tgpu.slot(roundCap);

const getJoinParent = tgpu.fn([u32], u32)((i) => (i - 4) >> 1);

const getJoinVertexPath = tgpu.fn([u32], JoinPath)((vertexIndex) => {
  // oxfmt-ignore
  const lookup = [u32(0), u32(0), /* dont care */u32(0), u32(1), u32(1), u32(2), u32(2), /* dont care */u32(2), u32(3), u32(3)];
  if (vertexIndex < 10) {
    return JoinPath({
      joinIndex: lookup[vertexIndex] as number,
      path: 0,
      depth: -1,
    });
  }
  let joinIndex = vertexIndex - 10;
  let depth = 0;
  let path = u32(0);
  while (joinIndex >= 4) {
    path = (path << 1) | (joinIndex & 1);
    joinIndex = getJoinParent(joinIndex);
    depth += 1;
  }
  return JoinPath({ joinIndex, path, depth });
});

const LineSegmentOutput = struct({
  vertexPosition: vec2f,
  situationIndex: u32,
});

export const lineSegmentVariableWidth = tgpu.fn([
  u32,
  LineSegmentVertex,
  LineSegmentVertex,
  LineSegmentVertex,
  LineSegmentVertex,
], LineSegmentOutput)((vertexIndex, A, B, C, D) => {
  const joinPath = getJoinVertexPath(vertexIndex);

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
      uv: vec2f(0, 0),
      situationIndex: 0,
    };
  }

  const isCapB = dot(AB, AB) <= radiusABDelta * radiusABDelta + 1e-12;
  const isCapC = dot(CD, CD) <= radiusCDDelta * radiusCDDelta + 1e-12;

  const eAB = externalNormals(AB, A.radius, B.radius);
  const eBC = externalNormals(BC, B.radius, C.radius);
  const eCD = externalNormals(CD, C.radius, D.radius);

  const nBC = normalize(BC);
  const nCB = mul(nBC, -1);

  let d0 = eBC.n1;
  let d4 = eBC.n2;
  let d5 = eBC.n2;
  let d9 = eBC.n1;

  const situationIndexB = joinSituationIndex(eAB.n1, eBC.n1, eAB.n2, eBC.n2);
  const situationIndexC = joinSituationIndex(eCD.n2, eBC.n2, eCD.n1, eBC.n1);
  let joinBu = true;
  let joinBd = true;
  let joinCu = true;
  let joinCd = true;
  if (!isCapB) {
    if (
      situationIndexB === 1 || situationIndexB === 5 ||
      dot(eBC.n2, eAB.n2) > JOIN_LIMIT.$
    ) {
      d4 = miterPoint(eBC.n2, eAB.n2);
      joinBd = false;
    }
    if (
      situationIndexB === 4 || situationIndexB === 5 ||
      dot(eAB.n1, eBC.n1) > JOIN_LIMIT.$
    ) {
      d0 = miterPoint(eAB.n1, eBC.n1);
      joinBu = false;
    }
  }
  if (!isCapC) {
    if (
      situationIndexC === 4 || situationIndexC === 5 ||
      dot(eCD.n2, eBC.n2) > JOIN_LIMIT.$
    ) {
      d5 = miterPoint(eCD.n2, eBC.n2);
      joinCd = false;
    }
    if (
      situationIndexC === 1 || situationIndexC === 5 ||
      dot(eBC.n1, eCD.n1) > JOIN_LIMIT.$
    ) {
      d9 = miterPoint(eBC.n1, eCD.n1);
      joinCu = false;
    }
  }

  let v0 = addMul(B.position, d0, B.radius);
  let v4 = addMul(B.position, d4, B.radius);
  let v5 = addMul(C.position, d5, C.radius);
  let v9 = addMul(C.position, d9, C.radius);

  const midBC = midPoint(B.position, C.position);
  const tBC1 = rot90cw(eBC.n1);
  const tBC2 = rot90ccw(eBC.n2);

  const limU = limitTowardsMiddle(midBC, tBC1, v0, v9);
  const limD = limitTowardsMiddle(midBC, tBC2, v4, v5);
  v0 = limU.a;
  v9 = limU.b;
  v4 = limD.a;
  v5 = limD.b;

  // after this point we need to process only one of the joins!
  const isCSide = joinPath.joinIndex >= 2;

  let situationIndex = situationIndexB;
  let V = B;
  let isCap = isCapB;
  let j1 = eAB.n1;
  let j2 = eBC.n1;
  let j3 = eAB.n2;
  let j4 = eBC.n2;
  let vu = v0;
  let vd = v4;
  let joinU = joinBu;
  let joinD = joinBd;
  if (isCSide) {
    situationIndex = situationIndexC;
    V = C;
    isCap = isCapC;
    j4 = eBC.n1;
    j3 = eCD.n1;
    j2 = eBC.n2;
    j1 = eCD.n2;
    vu = v5;
    vd = v9;
    joinU = joinCd;
    joinD = joinCu;
  }

  const joinIndex = joinPath.joinIndex;
  if (vertexIndex >= 10) {
    const shouldJoin = [u32(joinBu), u32(joinBd), u32(joinCd), u32(joinCu)];
    if (shouldJoin[joinIndex] === 0) {
      const noJoinPoints = [v0, v4, v5, v9];
      const vertexPosition = noJoinPoints[joinIndex] as v2f;
      return {
        situationIndex,
        vertexPosition,
      };
    }
  }

  let vertexPosition = vec2f();

  if (isCap) {
    if (isCSide) {
      vertexPosition = endCapSlot.$(vertexIndex, joinPath, V, vu, vd, j2, nBC, j4);
    } else {
      vertexPosition = startCapSlot.$(vertexIndex, joinPath, V, vu, vd, j2, nCB, j4);
    }
  } else {
    // oxfmt-ignore
    vertexPosition = joinSlot.$(
      situationIndex, vertexIndex,
      joinPath,
      V, vu, vd,
      j1, j2, j3, j4,
      joinU, joinD
    );
  }

  return {
    situationIndex,
    vertexPosition,
  };
});
