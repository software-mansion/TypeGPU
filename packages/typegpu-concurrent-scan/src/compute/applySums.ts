import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
  calculateIndex,
  operatorSlot,
  uniformAddLayout as uniformOpLayout,
  workgroupSize,
} from '../schemas.ts';

export const uniformOp = tgpu['~unstable'].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    nwg: d.builtin.numWorkgroups,
    wid: d.builtin.workgroupId,
  },
})(({ gid, nwg, wid }) => {
  const globalIdx = calculateIndex(gid, nwg);
  const workgroupId = calculateIndex(wid, nwg);
  const baseIdx = globalIdx * 8;
  const sumValue = uniformOpLayout.$.sums[workgroupId];

  for (let i = d.u32(0); i < 8; i++) {
    if (baseIdx + i < uniformOpLayout.$.input.length) {
      (uniformOpLayout.$.input[baseIdx + i] as number) = operatorSlot.$(
        uniformOpLayout.$.input[baseIdx + i] as number,
        sumValue as number,
      );
    }
  }
});
