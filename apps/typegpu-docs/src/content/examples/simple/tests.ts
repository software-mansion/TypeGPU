/*
{
  "title": "Tests",
  "category": "simple"
}
*/

import { onFrame } from '@typegpu/example-toolkit';
import { createRuntime, typedDevice } from 'typegpu';
import { struct, u32, vec3f } from 'typegpu/data';

const runtime = await createRuntime();

const device = typedDevice(runtime.device);

// will write to mapped range and unmap
const buffer2 = device.createBufferTyped(
  {
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    mappedAtCreation: true,
    type: struct({
      vec: vec3f,
      u: u32,
    }),
  },
  {
    vec: [1.1, 2.2, -1.1],
    u: 2,
  },
);

const code = `
    struct Params {
        v: vec3f,
        u: u32,
    };

    @group(0) @binding(0) var<storage, read_write> params: Params;

    @compute @workgroup_size(1)
    fn main() {
        params.u += u32(length(params.v));
    };
`;

const pipeline = device.createComputePipeline({
  layout: 'auto',
  compute: {
    module: device.createShaderModule({
      code: code,
    }),
  },
});

const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: buffer2,
      },
    },
  ],
});

let timer = 0;

onFrame((delta) => {
  timer += delta;
  if (timer > 1000) {
    timer = 0;
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(1);
    pass.end();
    device.queue.submit([encoder.finish()]);

    device.readBufferAsync(buffer2).then((v) => console.log(v.u));
  }
});
