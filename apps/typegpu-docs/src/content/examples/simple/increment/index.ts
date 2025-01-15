import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const layout = tgpu.bindGroupLayout({
  counter: { storage: d.u32, access: 'mutable' },
});

const shaderCode = /* wgsl */ `

@group(0) @binding(0) var<storage, read_write> counter: u32;

@compute @workgroup_size(1)
fn main() {
  counter += 1;
}`;

const root = await tgpu.init();
const device = root.device;

const pipeline = device.createComputePipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(layout)],
  }),
  compute: {
    module: device.createShaderModule({ code: shaderCode }),
  },
});

const counterBuffer = root.createBuffer(d.u32, 0).$usage('storage');
const bindGroup = root.createBindGroup(layout, {
  counter: counterBuffer,
});

const table = document.querySelector('.counter') as HTMLDivElement;

export const controls = {
  Increment: {
    onButtonClick: async () => {
      const encoder = device.createCommandEncoder();

      const pass = encoder.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, root.unwrap(bindGroup));
      pass.dispatchWorkgroups(1);
      pass.end();

      device.queue.submit([encoder.finish()]);

      const result = await counterBuffer.read();
      table.innerText = `${result}`;
    },
  },
};

export function onCleanup() {
  root.destroy();
}
