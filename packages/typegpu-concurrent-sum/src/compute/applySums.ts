import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { uniformAddLayout, workgroupSize } from '../schemas.ts';

export const uniformAdd = tgpu['~unstable'].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    nwg: d.builtin.numWorkgroups,
    wid: d.builtin.workgroupId,
  },
})(({ gid, nwg, wid }) => {
  const globalIdx = gid.x + gid.y * nwg.x + gid.z * nwg.x * nwg.y;
  const workgroupId = wid.x + wid.y * nwg.x + wid.z * nwg.x * nwg.y;
  const baseIdx = globalIdx * 8;
  const sumValue = uniformAddLayout.$.sums[workgroupId]!;

  for (let i = d.u32(0); i < 8; i++) {
    if (baseIdx + i < uniformAddLayout.$.input.length) {
      uniformAddLayout.$.input[baseIdx + i]! += sumValue;
    }
  }
});
