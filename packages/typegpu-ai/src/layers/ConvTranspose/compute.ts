import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
    activationFunctionSlot,
    calculateIndex,
    convWeightsLayout,
    ioLayout,
    workgroupSize,
} from '../../schemas.ts';

export const convTransposeCompute = tgpu['~unstable'].computeFn({
    workgroupSize: [workgroupSize],
    in: {
        gid: d.builtin.globalInvocationId,
        nwg: d.builtin.numWorkgroups,
    },
})(({ gid, nwg }) => {
    const linearIndex = calculateIndex(gid, nwg);
    if (linearIndex >= ioLayout.$.outLength) return;

    const inC = convWeightsLayout.$.dims[d.u32(0)] as number;
    const outC = convWeightsLayout.$.dims[d.u32(1)] as number;
    const inH = convWeightsLayout.$.dims[d.u32(2)] as number;
    const inW = convWeightsLayout.$.dims[d.u32(3)] as number;
    const kH = convWeightsLayout.$.dims[d.u32(4)] as number;
    const kW = convWeightsLayout.$.dims[d.u32(5)] as number;
    const strideH = convWeightsLayout.$.dims[d.u32(6)] as number;
    const strideW = convWeightsLayout.$.dims[d.u32(7)] as number;
    const padH = convWeightsLayout.$.dims[d.u32(8)] as number;
    const padW = convWeightsLayout.$.dims[d.u32(9)] as number;
    const dilationH = convWeightsLayout.$.dims[d.u32(10)] as number;
    const dilationW = convWeightsLayout.$.dims[d.u32(11)] as number;
    const outH = convWeightsLayout.$.dims[d.u32(12)] as number;
    const outW = convWeightsLayout.$.dims[d.u32(13)] as number;

    const ow = linearIndex % outW;
    const tmp = (linearIndex - ow) / outW;
    const oh = tmp % outH;
    const oc = (tmp - oh) / outH;

    let sum = d.f32(0);

    for (let ic = d.u32(0); ic < inC; ic = ic + d.u32(1)) {
        for (let kh = d.u32(0); kh < kH; kh = kh + d.u32(1)) {
            for (let kw = d.u32(0); kw < kW; kw = kw + d.u32(1)) {
                // Calculate input coordinates that could contribute to this output pixel
                // oh = ih * strideH + kh * dilationH - padH
                // => ih * strideH = oh + padH - kh * dilationH
                // So (oh + padH - kh * dilationH) must be divisible by strideH

                const numH = d.i32(oh) + d.i32(padH) - d.i32(kh * dilationH);
                const numW = d.i32(ow) + d.i32(padW) - d.i32(kw * dilationW);

                if (numH % d.i32(strideH) == d.i32(0) && numW % d.i32(strideW) == d.i32(0)) {
                    const ih = numH / d.i32(strideH);
                    const iw = numW / d.i32(strideW);

                    if (ih >= d.i32(0) && ih < d.i32(inH) && iw >= d.i32(0) && iw < d.i32(inW)) {
                        const inputIndex = ((ic * inH) + d.u32(ih)) * inW + d.u32(iw);
                        const weightIndex = ((((ic * outC) + oc) * kH) + kh) * kW + kw;

                        sum = sum + (ioLayout.$.input[d.u32(inputIndex)] as number) * (convWeightsLayout.$.weights[d.u32(weightIndex)] as number);
                    }
                }
            }
        }
    }

    // Add bias
    sum = sum + (convWeightsLayout.$.biases[d.u32(oc)] as number);
    ioLayout.$.output[linearIndex] = activationFunctionSlot.$(sum);
});
