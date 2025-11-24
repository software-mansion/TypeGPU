import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
    calculateIndex,
    concatParamsLayout,
    ioLayout,
    workgroupSize,
} from '../../schemas.ts';

export const concatCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [workgroupSize],
    in: {
        gid: d.builtin.globalInvocationId,
        nwg: d.builtin.numWorkgroups,
    },
})(({ gid, nwg }) => {
    const i = calculateIndex(gid, nwg);
    const len = ioLayout.$.inLength;

    if (i >= len) return;

    const offset = concatParamsLayout.$.offset;
    const val = ioLayout.$.input[i] as number;

    ioLayout.$.output[i + offset] = val;
});
