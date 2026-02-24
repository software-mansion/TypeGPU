// @ts-nocheck
// TODO: ^ REMOVE WHEN CODE WORKS AGAIN
import {
  addElement,
  addSliderParameter,
  onFrame,
} from '@typegpu/example-toolkit';

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice();

if (!device) {
  throw new Error('Failed to acquire a device');
}

const canvas = await addElement('canvas', { aspectRatio: 1 });
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const triangleVertexData = new Float32Array([0.0, 0.5, -0.5, -0.5, 0.5, -0.5]);

const triangleVertexBuffer = device.createBuffer({
  size: triangleVertexData.byteLength,
  usage: GPUBufferUsage.VERTEX,
  mappedAtCreation: true,
});
new Float32Array(triangleVertexBuffer.getMappedRange()).set(triangleVertexData);
triangleVertexBuffer.unmap();

const parametersBuffer = device.createBuffer({
  size: 4 * 3,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

addSliderParameter(
  'rotation',
  0,
  {
    min: 0,
    max: 3.14 * 2,
    step: 0.1,
  },
  (value) => {
    const data = new Float32Array([value]);
    device.queue.writeBuffer(parametersBuffer, 0, data);
  },
);

addSliderParameter(
  'x',
  0,
  {
    min: -1,
    max: 1,
    step: 0.1,
  },
  (value) => {
    const data = new Float32Array([value]);
    device.queue.writeBuffer(parametersBuffer, 4, data);
  },
);

addSliderParameter(
  'y',
  0,
  {
    min: -1,
    max: 1,
    step: 0.1,
  },
  (value) => {
    const data = new Float32Array([value]);
    device.queue.writeBuffer(parametersBuffer, 8, data);
  },
);

const wgslCode = `
  fn rotate(v: vec2f, angle: f32) -> vec2f {
    let pos = vec2(
      (v.x * cos(angle)) - (v.y * sin(angle)),
      (v.x * sin(angle)) + (v.y * cos(angle))
    );
    return pos;
  };

  struct Parameters {
    rotation : f32,
    x : f32,
    y : f32,
  };

  @binding(0) @group(0) var<uniform> params : Parameters;

  struct VertexOutput {
    @builtin(position) position : vec4f
  };

  @vertex
  fn mainVert(@location(0) v: vec2f) -> VertexOutput {
    let rotated = rotate(v, params.rotation);
    let offset = vec2(params.x, params.y);

    return VertexOutput(vec4f(rotated + offset, 0.0, 1.0));
  }

  @fragment
  fn mainFrag() -> @location(0) vec4f {
    return vec4(0.7686, 0.3922, 1.0, 1.0);
  }
`;

const module = device.createShaderModule({
  code: wgslCode,
});

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: module,
    buffers: [
      {
        arrayStride: 2 * 4,
        attributes: [
          {
            shaderLocation: 0,
            offset: 0,
            format: 'float32x2',
          },
        ],
      },
    ],
  },
  fragment: {
    module: module,
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

const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [
    {
      binding: 0,
      resource: {
        buffer: parametersBuffer,
      },
    },
  ],
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
  passEncoder.setVertexBuffer(0, triangleVertexBuffer);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.draw(3);
  passEncoder.end();

  device.queue.submit([commandEncoder.finish()]);
});
