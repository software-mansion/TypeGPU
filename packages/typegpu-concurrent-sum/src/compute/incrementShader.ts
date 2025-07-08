import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { dataBindGroupLayout as layout, workgroupSize } from '../schemas.ts';

export const incrementShader = tgpu['~unstable'].computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [workgroupSize],
})((input) => {
  const gId = input.gid.x;
  const totalInputLength = layout.$.workArray.length;

  if (gId < d.u32(totalInputLength)) {
    const blockId = d.u32(gId / (workgroupSize * 2));

    (layout.$.workArray[gId] as number) = layout.$
      .sumsArray[blockId] as number + (layout.$.inputArray[gId] as number);
  }
});
