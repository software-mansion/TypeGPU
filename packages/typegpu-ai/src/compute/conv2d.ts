import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { activationFunctionSlot, convWeightsLayout, ioLayout, calculateIndex, workgroupSize } from '../schemas.ts';

// Convolution compute kernel.
// Assumes N=1 (batch size 1), standard 2D convolution without dilation.
// Layout conventions:
//  - Input tensor flattened as [inChannels][inH][inW] (channels-first)
//  - Weights flattened as [outChannels][inChannels][kH][kW]
//  - Output flattened as [outChannels][outH][outW]
// dims buffer stores:
// [0]=inC, [1]=outC, [2]=inH, [3]=inW, [4]=kH, [5]=kW,
// [6]=strideH, [7]=strideW, [8]=padH, [9]=padW, [10]=outH, [11]=outW
export const conv2dCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    nwg: d.builtin.numWorkgroups,
  },
})(({ gid, nwg }) => {
  const linearIndex = calculateIndex(gid, nwg);
  const outLen = ioLayout.$.outLength; // total output elements
  if (linearIndex >= outLen) return;

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
  // Iterate over input channels and kernel window
  for (let ic = d.u32(0); ic < inC; ic = ic + d.u32(1)) {
    for (let kh = d.u32(0); kh < kH; kh = kh + d.u32(1)) {
      for (let kw = d.u32(0); kw < kW; kw = kw + d.u32(1)) {
        const inY = oh * strideH + kh - padH;
        const inX = ow * strideW + kw - padW;
        if (inY < d.u32(0) || inY >= inH || inX < d.u32(0) || inX >= inW) {
          continue; // outside padded region
        }
        // Input index: ((ic * inH) + inY) * inW + inX
        const inputIndex = ((ic * inH) + inY) * inW + inX;
        // Weight index: ((((oc * inC) + ic) * kH) + kh) * kW + kw
        const weightIndex = ((((oc * inC) + ic) * kH) + kh) * kW + kw;
        sum = sum + (ioLayout.$.input[inputIndex] as number) * (convWeightsLayout.$.weights[weightIndex] as number);
      }
    }
  }
  // Add bias
  sum = sum + (convWeightsLayout.$.biases[oc] as number);
  ioLayout.$.output[linearIndex] = activationFunctionSlot.$(sum);
});
