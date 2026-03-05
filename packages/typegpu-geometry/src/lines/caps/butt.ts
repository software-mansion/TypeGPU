import { vec2f } from 'typegpu/data';
import type { v2f } from 'typegpu/data';
import { dot, select } from 'typegpu/std';
import { addMul, rot90ccw, rot90cw } from '../../utils.ts';
import { intersectTangent, miterPointNoCheck } from '../utils.ts';
import { capShell } from './common.ts';

export const buttCap = capShell((vertexIndex, joinPath, V, vu, vd, right, dir, left) => {
  'use gpu';
  const shouldJoin = dot(dir, right) < 0;
  const dirRight = rot90cw(dir);
  const dirLeft = rot90ccw(dir);
  const u = select(intersectTangent(right, dirRight), dirRight, shouldJoin);
  const c = vec2f(0, 0);
  const d = select(intersectTangent(left, dirLeft), dirLeft, shouldJoin);

  const joinIndex = joinPath.joinIndex;
  if (joinPath.depth >= 0) {
    const miterR = select(u, miterPointNoCheck(right, dirRight), shouldJoin);
    const miterL = select(d, miterPointNoCheck(dirLeft, left), shouldJoin);
    const parents = [miterR, miterL];
    const dm = parents[joinIndex & 0b1] as v2f;
    return addMul(V.position, dm, V.radius);
  }

  const v1 = addMul(V.position, u, V.radius);
  const v0 = select(v1, vu, shouldJoin);
  const v2 = addMul(V.position, c, V.radius);
  const v3 = addMul(V.position, d, V.radius);
  const v4 = select(v3, vd, shouldJoin);
  const points = [v0, v1, v2, v3, v4];
  return points[vertexIndex % 5] as v2f;
});
