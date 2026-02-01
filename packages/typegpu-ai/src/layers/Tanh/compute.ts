import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import { ioLayout, workgroupSize, calculateIndex } from '../../schemas.ts';

export const tanhCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [workgroupSize],
    in: { gid: d.builtin.globalInvocationId, nwg: d.builtin.numWorkgroups },
})(({ gid, nwg }) => {
    const idx = calculateIndex(gid, nwg);
    const length = ioLayout.$.outLength;
    if (idx >= length) return;

    const x = ioLayout.$.input[idx] as number;
    const e2x = std.exp(2.0 * x);
    ioLayout.$.output[idx] = (e2x - 1.0) / (e2x + 1.0);
});
