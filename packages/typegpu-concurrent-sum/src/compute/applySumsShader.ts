import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
  dataBindGroupLayout as layout,
  fixedArrayLength,
  workgroupSize,
} from '../schemas.ts';

export const scanBlockSumsShader = tgpu['~unstable'].computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [1], // TODO: calc this based on the workgroup size
})((input) => {
  const numBlocks = d.u32(fixedArrayLength / (workgroupSize * 2));

  if (numBlocks <= 1) {
    return;
  }
  
  // scan on the sums array
  let sum = 0;
  for (let i = 0; i < numBlocks; i++) {
    const currentSum = layout.$.sumsArray[i] as number;
    layout.$.sumsArray[i] = sum;
    sum += currentSum;
  }
});



export const applySumsShader = tgpu['~unstable'].computeFn({
  in: {
    gid: d.builtin.globalInvocationId,
  },
  workgroupSize: [workgroupSize],
})((input) => {
  const gId = input.gid.x;
  
  if (gId < d.u32(fixedArrayLength)) {
    // Calculate which block this global ID belongs to
    const blockId = d.u32(gId / (workgroupSize * 2));
    
    // If this is not the first block, add the scanned sum of the previous block
    if (blockId > 0) {
      const previousBlockSum = layout.$.sumsArray[blockId - 1] as number;
      layout.$.workArray[gId] = (layout.$.workArray[gId] as number) + previousBlockSum;
    }
  }
});


