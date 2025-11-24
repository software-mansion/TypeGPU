import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
    activationFunctionSlot,
    calculateIndex,
    convWeightsLayout,
    ioLayout,
    workgroupSize,
} from '../../schemas.ts';

// ConvTranspose compute kernel.
// Assumes N=1 (batch size 1).
// Layout conventions:
//  - Input tensor flattened as [inChannels][inH][inW]
//  - Weights flattened as [inChannels][outChannels][kH][kW] (Note: ONNX standard is [inC, outC/group, kH, kW])
//  - Output flattened as [outChannels][outH][outW]
// dims buffer stores:
// [0]=inC, [1]=outC, [2]=inH, [3]=inW, [4]=kH, [5]=kW,
// [6]=strideH, [7]=strideW, [8]=padH, [9]=padW, [10]=outH, [11]=outW
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
    const outH = convWeightsLayout.$.dims[d.u32(10)] as number;
    const outW = convWeightsLayout.$.dims[d.u32(11)] as number;

    // Decompose linearIndex into (oc, oh, ow)
    const ow = linearIndex % outW;
    const tmp = (linearIndex - ow) / outW;
    const oh = tmp % outH;
    const oc = (tmp - oh) / outH;

    let sum = d.f32(0);

    // Iterate over input channels
    for (let ic = d.u32(0); ic < inC; ic = ic + d.u32(1)) {
        // Iterate over kernel spatial dimensions
        for (let kh = d.u32(0); kh < kH; kh = kh + d.u32(1)) {
            for (let kw = d.u32(0); kw < kW; kw = kw + d.u32(1)) {
                // Calculate input coordinates that could contribute to this output pixel
                // oh = ih * strideH + kh - padH
                // => ih * strideH = oh + padH - kh
                // So (oh + padH - kh) must be divisible by strideH

                const numH = d.i32(oh) + d.i32(padH) - d.i32(kh);
                const numW = d.i32(ow) + d.i32(padW) - d.i32(kw);

                if (numH % d.i32(strideH) == d.i32(0) && numW % d.i32(strideW) == d.i32(0)) {
                    const ih = numH / d.i32(strideH);
                    const iw = numW / d.i32(strideW);

                    if (ih >= d.i32(0) && ih < d.i32(inH) && iw >= d.i32(0) && iw < d.i32(inW)) {
                        // Input index: ((ic * inH) + ih) * inW + iw
                        const inputIndex = ((ic * inH) + d.u32(ih)) * inW + d.u32(iw);

                        // Weight index: [ic][oc][kh][kw]
                        // ((((ic * outC) + oc) * kH) + kh) * kW + kw
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
