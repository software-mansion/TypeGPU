/*
{
  "title": "Testing"
}
*/

import { ProgramBuilder, createRuntime, u32, wgsl } from 'wigsill';

const mem1 = wgsl.memory(u32).alias('mem1');
const mem2 = wgsl.memory(u32).alias('mem2');
const mem3 = wgsl.memory(u32).alias('mem3');
const mem4 = wgsl.memory(u32).alias('mem4');
const mem5 = wgsl.memory(u32).alias('mem5');
const mem6 = wgsl.memory(u32).alias('mem6');
const mem7 = wgsl.memory(u32).alias('mem7');
const mem8 = wgsl.memory(u32).alias('mem8');
const mem9 = wgsl
  .memory(u32)
  .setFlags(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC)
  .alias('mem9');

const shaderCode = wgsl`
@compute @workgroup_size(1) fn main(@builtin(global_invocation_id) grid: vec3u) {
  let mem1 = ${mem1};
  let mem2 = ${mem2};
  let mem3 = ${mem3};
  let mem4 = ${mem4};
  let mem5 = ${mem5};
  let mem6 = ${mem6};
  let mem7 = ${mem7};
  let mem8 = ${mem8};

  ${mem9} = mem1 + mem2 + mem3 + mem4 + mem5 + mem6 + mem7 + mem8;
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

mem1.write(runtime, 3);

device.queue.submit([commandEncoder.finish()]);

const val = await mem9.read(runtime);

console.log(val);
