import type { v2f } from 'typegpu/data';
import { add, mul, select } from 'typegpu/std';
import { addMul, bisectCcw, bisectNoCheck } from '../../utils.ts';
import { intersectLines } from '../utils.ts';
import { joinShell } from './common.ts';

export const roundJoin = joinShell(
  (situationIndex, vertexIndex, joinPath, V, vu, vd, ul, ur, dl, dr, joinU, joinD) => {
    'use gpu';
    const midU = bisectCcw(ur, ul);
    const midD = bisectCcw(dl, dr);
    const midR = bisectCcw(ur, dr);
    const midL = bisectCcw(dl, ul);

    const shouldCross = situationIndex === 1 || situationIndex === 4;
    const crossCenter = intersectLines(ul, dl, ur, dr).point;
    const averageCenter = mul(add(add(ur, ul), add(dl, dr)), 0.25);

    let uR = ur;
    let u = midU;
    let c = select(averageCenter, crossCenter, shouldCross);
    let d = midD;
    let dR = dr;

    if (situationIndex === 2) {
      uR = ur;
      u = midR;
      c = midR;
      d = midR;
      dR = dr;
    }

    if (situationIndex === 3) {
      uR = ur;
      u = midL;
      c = midL;
      d = midL;
      dR = dr;
    }

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

    const v1 = select(vu, addMul(V.position, u, V.radius), joinU);
    const v2 = select(vu, addMul(V.position, c, V.radius), joinU || joinD);
    const v3 = select(vd, addMul(V.position, d, V.radius), joinD);
    const points = [vu, v1, v2, v3, vd];
    return points[vertexIndex % 5] as v2f;
  },
);
