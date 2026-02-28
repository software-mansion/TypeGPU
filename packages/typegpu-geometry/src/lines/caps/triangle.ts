import type { v2f } from 'typegpu/data';
import { addMul } from '../../utils.ts';
import { capShell } from './common.ts';

export const triangleCap = capShell((vertexIndex, joinPath, V, vu, vd, right, dir, left) => {
  'use gpu';
  if (joinPath.depth >= 0) {
    const remove = [right, left];
    const dm = remove[joinPath.joinIndex & 0x1] as v2f;
    return addMul(V.position, dm, V.radius);
  }

  const v1 = addMul(V.position, right, V.radius);
  const v2 = addMul(V.position, dir, V.radius);
  const v3 = addMul(V.position, left, V.radius);
  const points = [vu, v1, v2, v3, vd];
  return points[vertexIndex % 5] as v2f;
});
