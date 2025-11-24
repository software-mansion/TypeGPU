import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
    calculateIndex,
    ioLayout,
    resizeParamsLayout,
    workgroupSize,
} from '../../schemas.ts';

// Resize compute kernel (Nearest Neighbor)
// Assumes NCHW layout
// dims: [0]=channels, [1]=inH, [2]=inW, [3]=outH, [4]=outW
export const resizeCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [workgroupSize],
    in: {
        gid: d.builtin.globalInvocationId,
        nwg: d.builtin.numWorkgroups,
    },
})(({ gid, nwg }) => {
    const linearIndex = calculateIndex(gid, nwg);
    if (linearIndex >= ioLayout.$.outLength) return;

    const channels = resizeParamsLayout.$.dims[d.u32(0)] as number;
    const inH = resizeParamsLayout.$.dims[d.u32(1)] as number;
    const inW = resizeParamsLayout.$.dims[d.u32(2)] as number;
    const outH = resizeParamsLayout.$.dims[d.u32(3)] as number;
    const outW = resizeParamsLayout.$.dims[d.u32(4)] as number;

    const scaleH = resizeParamsLayout.$.scales[d.u32(2)] as number; // scale for H (index 2 in NCHW scales)
    const scaleW = resizeParamsLayout.$.scales[d.u32(3)] as number; // scale for W (index 3 in NCHW scales)

    // Decompose linearIndex into (c, oh, ow)
    const ow = linearIndex % outW;
    const tmp = (linearIndex - ow) / outW;
    const oh = tmp % outH;
    const c = (tmp - oh) / outH;

    // Nearest neighbor interpolation
    // in_coord = out_coord / scale
    // We use floor to get the nearest pixel index (simplified)
    // More robust: floor(out_coord * (1/scale)) or similar depending on transformation mode
    // Assuming 'asymmetric' or 'pytorch_half_pixel' simplified to nearest

    // Using simple scaling: in = out / scale
    const inY = std.min(d.u32(std.floor(d.f32(oh) / scaleH)), d.u32(inH - 1));
    const inX = std.min(d.u32(std.floor(d.f32(ow) / scaleW)), d.u32(inW - 1));

    const inputIndex = ((c * inH) + inY) * inW + inX;
    ioLayout.$.output[linearIndex] = ioLayout.$.input[inputIndex] as number;
});
