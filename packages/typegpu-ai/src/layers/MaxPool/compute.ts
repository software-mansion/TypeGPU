import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  calculateIndex,
  ioLayout,
  maxPoolParamsLayout,
  workgroupSize,
} from '../../schemas.ts';

// MaxPool compute kernel.
// Layout conventions:
//  - Input tensor flattened as [channels][inH][inW]
//  - Output flattened as [channels][outH][outW]
// dims buffer stores:
// [0]=channels, [1]=inH, [2]=inW, [3]=kH, [4]=kW,
// [5]=strideH, [6]=strideW, [7]=padH, [8]=padW, [9]=outH, [10]=outW
export const maxPoolCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    nwg: d.builtin.numWorkgroups,
  },
})(({ gid, nwg }) => {
  const linearIndex = calculateIndex(gid, nwg);
  if (linearIndex >= ioLayout.$.outLength) return;

  const channels = maxPoolParamsLayout.$.dims[d.u32(0)] as number;
  const inH = maxPoolParamsLayout.$.dims[d.u32(1)] as number;
  const inW = maxPoolParamsLayout.$.dims[d.u32(2)] as number;
  const kH = maxPoolParamsLayout.$.dims[d.u32(3)] as number;
  const kW = maxPoolParamsLayout.$.dims[d.u32(4)] as number;
  const strideH = maxPoolParamsLayout.$.dims[d.u32(5)] as number;
  const strideW = maxPoolParamsLayout.$.dims[d.u32(6)] as number;
  const padH = maxPoolParamsLayout.$.dims[d.u32(7)] as number;
  const padW = maxPoolParamsLayout.$.dims[d.u32(8)] as number;
  const outH = maxPoolParamsLayout.$.dims[d.u32(9)] as number;
  const outW = maxPoolParamsLayout.$.dims[d.u32(10)] as number;

  // Decompose linearIndex into (c, oh, ow)
  const ow = linearIndex % outW;
  const tmp = (linearIndex - ow) / outW;
  const oh = tmp % outH;
  const c = (tmp - oh) / outH;

  let maxVal = d.f32(-3.402823466e+38); // -FLT_MAX

  for (let kh = d.u32(0); kh < kH; kh = kh + d.u32(1)) {
    for (let kw = d.u32(0); kw < kW; kw = kw + d.u32(1)) {
      const inY = d.i32(oh * strideH + kh) - d.i32(padH);
      const inX = d.i32(ow * strideW + kw) - d.i32(padW);

      if (
        inY >= d.i32(0) && inY < d.i32(inH) && inX >= d.i32(0) &&
        inX < d.i32(inW)
      ) {
        const inputIndex = ((c * inH) + d.u32(inY)) * inW + d.u32(inX);
        const val = ioLayout.$.input[d.u32(inputIndex)] as number;
        maxVal = std.max(maxVal, val);
      }
    }
  }

  ioLayout.$.output[linearIndex] = maxVal;
});
