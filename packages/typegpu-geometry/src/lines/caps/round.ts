import type { v2f } from 'typegpu/data';
import { select } from 'typegpu/std';
import { addMul, bisectCcw, bisectNoCheck } from '../../utils.ts';
import { capShell } from './common.ts';

export const roundCap = capShell((vertexIndex, joinPath, V, vu, vd, right, dir, left) => {
  'use gpu';
  const uR = right;
  const u = dir;
  const c = dir;
  const d = dir;
  const dR = left;

  const joinIndex = joinPath.joinIndex;
  if (joinPath.depth >= 0) {
    const parents = [uR, u, d, dR];
    let d0 = parents[(joinIndex * 2) & 3] as v2f;
    let d1 = parents[(joinIndex * 2 + 1) & 3] as v2f;
    let dm = bisectCcw(d0, d1);
    let path = joinPath.path;
    for (let depth = joinPath.depth; depth > 0; depth -= 1) {
      const isLeftChild = (path & 1) === 0;
      d0 = select(dm, d0, isLeftChild);
      d1 = select(d1, dm, isLeftChild);
      dm = bisectNoCheck(d0, d1);
      path >>= 1;
    }
    return addMul(V.position, dm, V.radius);
  }

  const v1 = addMul(V.position, u, V.radius);
  const v2 = addMul(V.position, c, V.radius);
  const v3 = addMul(V.position, d, V.radius);
  const points = [vu, v1, v2, v3, vd];
  return points[vertexIndex % 5] as v2f;
});
