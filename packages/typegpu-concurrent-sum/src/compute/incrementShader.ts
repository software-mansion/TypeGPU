import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
  dataBindGroupLayout as layout,
  fixedArrayLength,
  workgroupSize,
} from '../schemas.ts';

export const incrementShader = tgpu['~unstable'].computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [workgroupSize],
})((input) => {
  const gId = input.gid.x;

  if (gId < d.u32(fixedArrayLength)) {
    const blockId = d.u32(gId / (workgroupSize * 2));

    if (blockId > 0) {
      (layout.$.workArray[gId] as number) += layout.$
        .sumsArray[blockId - 1] as number;
    }
  }
});
