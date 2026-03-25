// @ts-nocheck
// TODO: ^ REMOVE WHEN CODE WORKS AGAIN
import { addElement, onFrame } from '@typegpu/example-toolkit';

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();

if (!device) {
  throw new Error('Failed to acquire a device');
}

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: device.createShaderModule({
      code: `
        @vertex
        fn main(
          @builtin(vertex_index) VertexIndex : u32
        ) -> @builtin(position) vec4f {
          var pos = array<vec2f, 3>(
            vec2(0.0, 0.5),
            vec2(-0.5, -0.5),
            vec2(0.5, -0.5)
          );

          return vec4f(pos[VertexIndex], 0.0, 1.0);
        }
      `,
    }),
  },
  fragment: {
    module: device.createShaderModule({
      code: `
        @fragment
        fn main() -> @location(0) vec4f {
          return vec4(0.7686, 0.3922, 1.0, 1.0);
        }
      `,
    }),
    targets: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
});

onFrame(() => {
  const commandEncoder = device.createCommandEncoder();
  const textureView = context.getCurrentTexture().createView();

  const renderPassDescriptor: GPURenderPassDescriptor = {
    colorAttachments: [
      {
        view: textureView,
        clearValue: [0, 0, 0, 0],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  };

  const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
  passEncoder.setPipeline(pipeline);
  passEncoder.draw(3);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
});
