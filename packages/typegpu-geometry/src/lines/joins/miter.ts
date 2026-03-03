import tgpu from 'typegpu';
import { add, dot, mul, normalize, select } from 'typegpu/std';
import { addMul, bisectCcw } from '../../utils.ts';
import { intersectLines, miterPoint } from '../utils.ts';
import { joinShell } from './common.ts';
import { f32, type v2f, vec2f } from 'typegpu/data';

export const miterJoinLimitSlot = tgpu.slot(2);

/**
 * Limits the miter point to the given limit ratio, which is
 * a length relative to the line vertex radius.
 */
export const miterLimit = tgpu.fn(
  [vec2f, f32],
  vec2f,
)((miter, limitRatio) => {
  const m2 = dot(miter, miter);
  if (m2 > limitRatio * limitRatio) {
    return mul(normalize(miter), ((limitRatio - 1) * (limitRatio * limitRatio - 1)) / (m2 - 1) + 1);
  }
  return miter;
});

export const miterJoin = joinShell(
  (situationIndex, vertexIndex, joinPath, V, vu, vd, ul, ur, dl, dr, joinU, joinD) => {
    'use gpu';
    let miterU = miterPoint(ur, ul);
    let miterD = miterPoint(dl, dr);
    miterU = miterLimit(miterU, miterJoinLimitSlot.$);
    miterD = miterLimit(miterD, miterJoinLimitSlot.$);

    const shouldCross = situationIndex === 1 || situationIndex === 4;
    const crossCenter = intersectLines(ul, dl, ur, dr).point;
    const averageCenter = mul(add(normalize(miterU), normalize(miterD)), 0.5);

    let uR = ur;
    let u = miterU;
    let c = select(averageCenter, crossCenter, shouldCross);
    let d = miterD;
    let dR = dr;

    if (situationIndex === 2) {
      const mid = bisectCcw(ur, dr);
      uR = ur;
      u = mid;
      c = mid;
      d = mid;
      dR = dr;
    }

    if (situationIndex === 3) {
      const mid = bisectCcw(dl, ul);
      uR = ur;
      u = mid;
      c = mid;
      d = mid;
      dR = dr;
    }

    const joinIndex = joinPath.joinIndex;
    if (joinPath.depth >= 0) {
      const parents = [uR, u, d, dR];
      const d0 = parents[(joinIndex * 2) & 3] as v2f;
      const d1 = parents[(joinIndex * 2 + 1) & 3] as v2f;
      const dm = miterPoint(d0, d1);
      return addMul(V.position, dm, V.radius);
    }

    const v1 = select(vu, addMul(V.position, u, V.radius), joinU);
    const v2 = select(vu, addMul(V.position, c, V.radius), joinU || joinD);
    const v3 = select(vd, addMul(V.position, d, V.radius), joinD);
    const points = [vu, v1, v2, v3, vd];
    return points[vertexIndex % 5] as v2f;
  },
);
