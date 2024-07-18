/*
{
  "title": "Testing"
}
*/

import { onFrame } from '@wigsill/example-toolkit';
import { ProgramBuilder, createRuntime, u32, wgsl } from 'wigsill';

const mem1 = wgsl.memory(u32).$name('mem1');
const mem2 = wgsl.memory(u32).$name('mem2');
const mem3 = wgsl.memory(u32).$name('mem3');
const mem4 = wgsl.memory(u32).$name('mem4');
const mem5 = wgsl.memory(u32).$name('mem5');
const mem6 = wgsl.memory(u32).$name('mem6');
const mem7 = wgsl.memory(u32).$name('mem7');
const mem8 = wgsl.memory(u32).$name('mem8');
const mem9 = wgsl
  .memory(u32)
  .setFlags(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)
  .$name('mem9');
const mem10 = wgsl.memory(u32).$name('mem10');
const mem11 = wgsl.memory(u32).$name('mem11');
const mem12 = wgsl.memory(u32).$name('mem12');
// const mem13 = wgsl.memory(u32).$name('mem13');
// const mem14 = wgsl.memory(u32).$name('mem14');

const shaderCode = wgsl`
@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) grid: vec3u) {
  ${mem9} = ${mem1} + ${mem2} + ${mem3} + ${mem4} + ${mem5} + ${mem6} + ${mem7} + ${mem8} + ${mem10} + ${mem11} + ${mem12};
}
`;

const runtime = await createRuntime();
const device = runtime.device;

const program = new ProgramBuilder(runtime, shaderCode).build({
  bindingGroup: 0,
  shaderStage: GPUShaderStage.COMPUTE,
});

const computeShader = device.createShaderModule({ code: program.code });

const computePipeline = device.createComputePipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [program.bindGroupLayout],
  }),
  compute: {
    module: computeShader,
  },
});

const commandEncoder = device.createCommandEncoder();
const computePass = commandEncoder.beginComputePass();
computePass.setPipeline(computePipeline);
computePass.setBindGroup(0, program.bindGroup);
computePass.dispatchWorkgroups(1);
computePass.end();
const commandBuffer = commandEncoder.finish();

device.queue.submit([commandBuffer]);
await device.queue.onSubmittedWorkDone();

onFrame(async () => {
  const val = await mem9.read(runtime);
  const commandEncoder = device.createCommandEncoder();
  const computePass = commandEncoder.beginComputePass();
  computePass.setPipeline(computePipeline);
  computePass.setBindGroup(0, program.bindGroup);
  computePass.dispatchWorkgroups(1);
  computePass.end();
  const commandBuffer = commandEncoder.finish();
  device.queue.submit([commandBuffer]);
  await device.queue.onSubmittedWorkDone();

  mem1.write(runtime, val + 1);
  console.log(val);
});
