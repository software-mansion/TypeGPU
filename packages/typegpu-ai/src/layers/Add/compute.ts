import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
    addParamsLayout,
    calculateIndex,
    ioLayout,
    workgroupSize,
} from '../../schemas.ts';

// Add compute kernel (Element-wise with broadcasted constant)
// Assumes 'other' is a bias vector of size [channels] or scalar, or same size.
// For now, implementing simple element-wise add where 'other' is same size or broadcasted from channels?
// Let's assume 'other' is same size for simplicity or bias [C] if dims match.
// Actually, to keep it simple and consistent with Conv bias, let's assume it might be a bias vector [C] 
// or a full tensor.
// But wait, if it's a full tensor from another branch, we can't access it easily via 'addParamsLayout' which uses 'storage'.
// If it's a constant initializer, it fits in 'storage'.
// Let's implement generic element-wise add where 'other' is same size as input.
export const addCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [workgroupSize],
    in: {
        gid: d.builtin.globalInvocationId,
        nwg: d.builtin.numWorkgroups,
    },
})(({ gid, nwg }) => {
    const i = calculateIndex(gid, nwg);
    if (i >= ioLayout.$.outLength) return;

    // Simple element-wise add
    // TODO: Handle broadcasting if needed.
    const valA = ioLayout.$.input[i] as number;
    const valB = addParamsLayout.$.other[i] as number;

    ioLayout.$.output[i] = valA + valB;
});
