import { vec2f } from 'typegpu/data';
import type { v2f } from 'typegpu/data';
import { addMul, rot90ccw, rot90cw } from '../../utils.ts';
import { capShell } from './common.ts';

export const arrowCap = capShell((vertexIndex, joinPath, V, vu, vd, _right, dir, _left) => {
  'use gpu';
  const dirRight = rot90cw(dir);
  const dirLeft = rot90ccw(dir);

  const v0 = addMul(vu, dir, -7.5 * V.radius);
  const v1 = addMul(V.position, addMul(dirRight, dir, -3), 3 * V.radius);
  const v2 = addMul(V.position, vec2f(0, 0), 2 * V.radius);
  const v3 = addMul(V.position, addMul(dirLeft, dir, -3), 3 * V.radius);
  const v4 = addMul(vd, dir, -7.5 * V.radius);
  const points = [v0, v1, v2, v3, v4];

  if (joinPath.depth >= 0) {
    const remove = [v0, v4];
    const dm = remove[joinPath.joinIndex & 0x1] as v2f;
    return dm;
  }

  return points[vertexIndex % 5] as v2f;
});
