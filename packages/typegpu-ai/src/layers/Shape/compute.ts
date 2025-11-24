import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
    calculateIndex,
    ioLayout,
    shapeParamsLayout,
    workgroupSize,
} from '../../schemas.ts';

export const shapeCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [workgroupSize],
    in: {
        gid: d.builtin.globalInvocationId,
        nwg: d.builtin.numWorkgroups,
    },
})(({ gid, nwg }) => {
    const i = calculateIndex(gid, nwg);
    if (i >= ioLayout.$.outLength) return;

    // Copy shape dimensions from params to output
    ioLayout.$.output[i] = shapeParamsLayout.$.dims[i] as number;
});
