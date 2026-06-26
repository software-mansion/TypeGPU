import tgpu, { d, std } from 'typegpu';
import { ELEMENTS_PER_THREAD, operatorSlot, uniformOpLayout, WORKGROUP_SIZE } from '../schemas.ts';

export const uniformOp = tgpu.computeFn({
  workgroupSize: [WORKGROUP_SIZE],
  in: {
    gid: d.builtin.globalInvocationId,
    wid: d.builtin.workgroupId,
  },
})(({ gid, wid }) => {
  const globalIdx = gid.x;
  const workgroupId = wid.x;
  const baseIdx = globalIdx * ELEMENTS_PER_THREAD;
  const opValue = uniformOpLayout.$.sums[workgroupId];

  for (const i of tgpu.unroll(std.range(ELEMENTS_PER_THREAD))) {
    if (baseIdx + i < uniformOpLayout.$.input.length) {
      (uniformOpLayout.$.input[baseIdx + i] as number) = operatorSlot.$(
        opValue as number,
        uniformOpLayout.$.input[baseIdx + i] as number,
      );
    }
  }
});
