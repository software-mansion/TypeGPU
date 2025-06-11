// import tgpu from 'typegpu';
// import * as d from 'typegpu/data';
// import * as std from 'typegpu/std';

// // Define the bind group layout
// export const prefixSumBindGroupLayout = tgpu.bindGroupLayout({
//   input: { buffer: { type: 'read-only-storage' } },
//   output: { buffer: { type: 'storage' } },
//   workBuffer: { buffer: { type: 'storage' } },
//   sizes: { buffer: { type: 'uniform' } },
// });

// // Define the parameters for the compute operation
// export const DEFAULT_WORKGROUP_SIZE = 256;

// export type SizesUniform = {
//   inputLength: number;
//   workgroupSize: number;
// };

// // Up-sweep phase (reduction)
// export const upSweepShader = tgpu['~unstable']
//   .computeFn({
//     in: { gid: d.builtin.globalInvocationId },
//     workgroupSize: [DEFAULT_WORKGROUP_SIZE],
//   })((input) => {
//     const threadId = input.gid.x;
//     const sizes = prefixSumBindGroupLayout.$.sizes as SizesUniform;
//     const inputLength = d.u32(sizes.inputLength);

//     // Stride iterates through 2, 4, 8, etc. (powers of 2)
//     // Each thread processes elements based on its ID
//     for (let stride = 1; stride < inputLength; stride *= 2) {
//       const index = d.u32((threadId + 1) * 2 * stride - 1);
//       if (index < inputLength) {
//         const leftIndex = d.u32(index - stride);
//         prefixSumBindGroupLayout.$.workBuffer[index] = std.add(
//           prefixSumBindGroupLayout.$.workBuffer[leftIndex],
//           prefixSumBindGroupLayout.$.workBuffer[index],
//         );
//       }

//       // Barrier to ensure all threads complete this step before proceeding
//       tgpu.workgroupBarrier();
//     }
//   })
//   .$name('up-sweep shader');

// // Down-sweep phase
// export const downSweepShader = tgpu['~unstable']
//   .computeFn({
//     in: { gid: d.builtin.globalInvocationId },
//     workgroupSize: [DEFAULT_WORKGROUP_SIZE],
//   })((input) => {
//     const threadId = input.gid.x;
//     const sizes = prefixSumBindGroupLayout.$.sizes as SizesUniform;
//     const inputLength = d.u32(sizes.inputLength);

//     // Initialize the very last element to 0 (this is the "identity" element for sum)
//     if (threadId === 0) {
//       const lastIndex = d.u32(inputLength - 1);
//       // Store the last value before setting it to zero (total sum)
//       const totalSum = prefixSumBindGroupLayout.$.workBuffer[lastIndex];
//       prefixSumBindGroupLayout.$.workBuffer[lastIndex] = d.f32(0);
//       // Store the total sum as the last element in the output
//       prefixSumBindGroupLayout.$.output[lastIndex] = totalSum;
//     }

//     tgpu.workgroupBarrier();

//     // Stride iterates through n/2, n/4, n/8, etc. (powers of 2)
//     for (let stride = inputLength / 2; stride > 0; stride /= 2) {
//       const index = d.u32((threadId + 1) * 2 * stride - 1);

//       if (index < inputLength) {
//         const leftIndex = d.u32(index - stride);

//         // Swap and add pattern
//         const temp = prefixSumBindGroupLayout.$.workBuffer[index];
//         prefixSumBindGroupLayout.$.workBuffer[index] = std.add(
//           prefixSumBindGroupLayout.$.workBuffer[index],
//           prefixSumBindGroupLayout.$.workBuffer[leftIndex],
//         );
//         prefixSumBindGroupLayout.$.workBuffer[leftIndex] = temp;
//       }

//       // Barrier to ensure all threads complete this step before proceeding
//       tgpu.workgroupBarrier();
//     }

//     // Copy the results to the output buffer
//     if (threadId < inputLength) {
//       prefixSumBindGroupLayout.$.output[threadId] =
//         prefixSumBindGroupLayout.$.workBuffer[threadId];
//     }
//   })
//   .$name('down-sweep shader');

// // Initialize the work buffer (copy input to work buffer)
// export const initWorkBufferShader = tgpu['~unstable']
//   .computeFn({
//     in: { gid: d.builtin.globalInvocationId },
//     workgroupSize: [DEFAULT_WORKGROUP_SIZE],
//   })((input) => {
//     const threadId = input.gid.x;
//     const sizes = prefixSumBindGroupLayout.$.sizes as SizesUniform;
//     const inputLength = d.u32(sizes.inputLength);

//     if (threadId < inputLength) {
//       prefixSumBindGroupLayout.$.workBuffer[threadId] =
//         prefixSumBindGroupLayout.$.input[threadId];
//     }
//   })
//   .$name('init work buffer shader');

// // Utility function to get power of 2 ceiling for the input length
// // This is needed because Blelloch scan works with power-of-2 sized arrays
// export const getPowerOfTwoCeiling = (n: number): number => {
//   let power = 1;
//   while (power < n) {
//     power *= 2;
//   }
//   return power;
// };
