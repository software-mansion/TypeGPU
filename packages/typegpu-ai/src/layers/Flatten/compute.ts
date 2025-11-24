import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { calculateIndex, ioLayout, workgroupSize } from '../../schemas.ts';

export const flattenCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    nwg: d.builtin.numWorkgroups,
  },
})(({ gid, nwg }) => {
  const i = calculateIndex(gid, nwg);
  if (i >= ioLayout.$.outLength) return;

  // Simple copy since memory layout is already flat
  ioLayout.$.output[i] = ioLayout.$.input[i] as number;
});
