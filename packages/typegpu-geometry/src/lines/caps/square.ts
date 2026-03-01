import type { v2f } from 'typegpu/data';
import { add, dot, select } from 'typegpu/std';
import { addMul, rot90ccw, rot90cw } from '../../utils.ts';
import { miterPointNoCheck } from '../utils.ts';
import { capShell } from './common.ts';

export const squareCap = capShell((vertexIndex, joinPath, V, vu, vd, right, dir, left) => {
  'use gpu';
  const shouldJoin = dot(dir, right) < 0;
  const dirRight = rot90cw(dir);
  const dirLeft = rot90ccw(dir);
  const u = select(miterPointNoCheck(right, dir), add(dir, dirRight), shouldJoin);
  const c = dir;
  const d = select(miterPointNoCheck(dir, left), add(dir, dirLeft), shouldJoin);

  const joinIndex = joinPath.joinIndex;
  if (joinPath.depth >= 0) {
    const miterR = select(right, miterPointNoCheck(right, dirRight), shouldJoin);
    const miterL = select(left, miterPointNoCheck(dirLeft, left), shouldJoin);
    const parents = [miterR, miterL];
    const dm = parents[joinIndex & 0b1] as v2f;
    return addMul(V.position, dm, V.radius);
  }

  const v1 = addMul(V.position, u, V.radius);
  const v2 = addMul(V.position, c, V.radius);
  const v3 = addMul(V.position, d, V.radius);
  const points = [vu, v1, v2, v3, vd];
  return points[vertexIndex % 5] as v2f;
});
