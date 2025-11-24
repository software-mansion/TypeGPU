import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
    calculateIndex,
    clipParamsLayout,
    ioLayout,
    workgroupSize,
} from '../../schemas.ts';

export const clipCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [workgroupSize],
    in: {
        gid: d.builtin.globalInvocationId,
        nwg: d.builtin.numWorkgroups,
    },
})(({ gid, nwg }) => {
    const i = calculateIndex(gid, nwg);
    if (i >= ioLayout.$.outLength) return;

    const minVal = clipParamsLayout.$.bounds[d.u32(0)] as number;
    const maxVal = clipParamsLayout.$.bounds[d.u32(1)] as number;
    const val = ioLayout.$.input[i] as number;

    ioLayout.$.output[i] = std.clamp(val, minVal, maxVal);
});
