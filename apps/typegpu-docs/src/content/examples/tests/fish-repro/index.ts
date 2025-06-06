import fs from 'fs';
const f = fs;

// setup

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
const copyModule = device!.createShaderModule({
  label: 'copying compute module',
  code: `
    struct Item {
      vec: vec3f,
      num: u32,
    }

    @group(0) @binding(0) var<storage, read> sourceBuffer: Item;
    @group(0) @binding(1) var<storage, read_write> targetBuffer: Item;

    @compute @workgroup_size(1) fn computeShader_0(@builtin(global_invocation_id) gid: vec3u){
      var item = sourceBuffer;
      targetBuffer = item;
    }
    `,
});

const pipeline = device!.createComputePipeline({
  label: 'copying compute pipeline',
  layout: 'auto',
  compute: {
    module: copyModule,
  },
});

// work buffer 1
const sourceBuffer = device!.createBuffer({
  label: 'source buffer',
  size: 16,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC |
    GPUBufferUsage.COPY_DST,
});

// work buffer 2
const targetBuffer = device!.createBuffer({
  label: 'target buffer',
  size: 16,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC |
    GPUBufferUsage.COPY_DST,
});

// buffer for reading the results
const resultBuffer = device!.createBuffer({
  label: 'result buffer',
  size: 16,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});

const bindGroup = device!.createBindGroup({
  label: 'bind group for work buffers',
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: sourceBuffer } },
    { binding: 1, resource: { buffer: targetBuffer } },
  ],
});

// input copying and compute pass

const input = new DataView(new ArrayBuffer(16));
input.setFloat32(0, 1);
input.setFloat32(4, 3);
input.setFloat32(8, 5);
input.setUint32(12, 7);
device!.queue.writeBuffer(sourceBuffer, 0, input);

const encoder = device!.createCommandEncoder({
  label: 'copying encoder',
});
const pass = encoder.beginComputePass({
  label: 'copying compute pass',
});
pass.setPipeline(pipeline);
pass.setBindGroup(0, bindGroup);
pass.dispatchWorkgroups(1);
pass.end();

encoder.copyBufferToBuffer(targetBuffer, 0, resultBuffer, 0, 16);
device!.queue.submit([encoder.finish()]);

await resultBuffer.mapAsync(GPUMapMode.READ);
const result = new DataView(resultBuffer.getMappedRange().slice());
resultBuffer.unmap();

console.log(input.buffer, result.buffer);
