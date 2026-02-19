import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { operatorSlot, uniformAddLayout, WORKGROUP_SIZE } from '../schemas.ts';

export const uniformOp = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    wid: d.builtin.workgroupId,
  },
})(({ gid, wid }) => {
  const globalIdx = gid.x;
  const workgroupId = wid.x;
  const baseIdx = globalIdx * 8;
  const sumValue = uniformAddLayout.$.sums[workgroupId];

  // TODO: use `tgpu.unroll(8)`
  for (let i = d.u32(0); i < 8; i++) {
    if (baseIdx + i < uniformAddLayout.$.input.length) {
      (uniformAddLayout.$.input[baseIdx + i] as number) = operatorSlot.$(
        uniformAddLayout.$.input[baseIdx + i] as number,
        sumValue as number,
      );
    }
  }
});
