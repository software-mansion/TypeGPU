import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import {
  activationFunctionSlot,
  ioLayout,
  weightsBiasesLayout,
} from './schemas.ts';
import { calculateIndex, workgroupSize } from './schemas.ts';

export const nnCompute = tgpu['~unstable'].computeFn({
  workgroupSize: [workgroupSize],
  in: {
    gid: d.builtin.globalInvocationId,
    nwg: d.builtin.numWorkgroups,
    wid: d.builtin.workgroupId,
  },
})(({ gid, nwg, wid }) => {
  const i = calculateIndex(gid, nwg);
  if (i >= ioLayout.$.outLength) {
    return;
  }

  const weightsOffset = i * ioLayout.$.inLength;

  let sum = d.f32(0);
  for (let j = d.u32(0); j < ioLayout.$.inLength; j = j + d.u32(1)) {
    sum = sum +
      (ioLayout.$.input[j] as number) *
        (weightsBiasesLayout.$.weights[weightsOffset + j] as number);
  }

  sum = sum + (weightsBiasesLayout.$.biases[i] as number);
  ioLayout.$.output[i] = activationFunctionSlot.$(sum);
});
