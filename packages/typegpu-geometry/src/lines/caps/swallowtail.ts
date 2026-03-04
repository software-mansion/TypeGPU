import type { v2f } from 'typegpu/data';
import { addMul, midPoint } from '../../utils.ts';
import { add } from 'typegpu/std';
import { capShell } from './common.ts';

export const swallowtailCap = capShell((vertexIndex, joinPath, V, vu, vd, right, dir, left) => {
  'use gpu';
  if (joinPath.depth >= 0) {
    const remove = [right, left];
    const dm = remove[joinPath.joinIndex & 0x1] as v2f;
    return addMul(V.position, dm, V.radius);
  }

  const v1 = addMul(V.position, add(right, dir), V.radius);
  const v2 = addMul(V.position, midPoint(right, left), V.radius);
  const v3 = addMul(V.position, add(left, dir), V.radius);
  const points = [vu, v1, v2, v3, vd];
  return points[vertexIndex % 5] as v2f;
});
