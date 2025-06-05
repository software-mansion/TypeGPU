import tgpu from 'typegpu';
const t = tgpu;

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();
const copyModule = device!.createShaderModule({
  label: 'copying compute module',
  code: `
    struct Input {
      @builtin(global_invocation_id) gid: vec3u,
    }

    struct Item {
      vec: vec3f,
      num: u32,
    }

    @group(0) @binding(0) var<storage, read> sourceBuffer: array<Item>;
    @group(0) @binding(1) var<storage, read_write> targetBuffer: array<Item>;

    @compute @workgroup_size(1) fn computeShader_0(input: Input){
      var index = input.gid.x;
//      var itemData1: vec3f = sourceBuffer[index].vec;
//      targetBuffer[index].vec = itemData1;
//      var itemData2: u32 = sourceBuffer[index].num;
//      targetBuffer[index].num = itemData2;
      var item = sourceBuffer[index];
      targetBuffer[index] = item;
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

const sourceBuffer = device!.createBuffer({
  label: 'source buffer',
  size: 16,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC |
    GPUBufferUsage.COPY_DST,
});
const input = new DataView(new ArrayBuffer(16));
input.setFloat32(0, 1);
input.setFloat32(4, 3);
input.setFloat32(8, 5);
input.setUint32(12, 7);
device!.queue.writeBuffer(sourceBuffer, 0, input);

const targetBuffer = device!.createBuffer({
  label: 'source buffer',
  size: 16,
  usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC |
    GPUBufferUsage.COPY_DST,
});

const bindGroup = device!.createBindGroup({
  label: 'bind group for work buffer',
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    { binding: 0, resource: { buffer: sourceBuffer } },
    { binding: 1, resource: { buffer: targetBuffer } },
  ],
});

// Encode commands to do the computation
const encoder = device!.createCommandEncoder({
  label: 'copying encoder',
});
const pass = encoder.beginComputePass({
  label: 'copying compute pass',
});
pass.setPipeline(pipeline);
pass.setBindGroup(0, bindGroup);
pass.dispatchWorkgroups(4);
pass.end();

const resultBuffer = device!.createBuffer({
  label: 'result buffer',
  size: 16,
  usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
});

encoder.copyBufferToBuffer(targetBuffer, 0, resultBuffer, 0, 16);
const commandBuffer = encoder.finish();
device!.queue.submit([commandBuffer]);

// Read the results
await resultBuffer.mapAsync(GPUMapMode.READ);
const result = new DataView(resultBuffer.getMappedRange().slice());
resultBuffer.unmap();

console.log(input.buffer, result.buffer);
