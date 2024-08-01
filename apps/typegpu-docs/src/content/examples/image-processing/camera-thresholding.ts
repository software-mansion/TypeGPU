/*
{
  "title": "Camera Thresholding",
  "category": "image-processing"
}
*/

// -- Hooks into the example environment
import { addElement, addParameter, onFrame } from '@typegpu/example-toolkit';
// --

import wgsl from 'typegpu';
import { f32 } from 'typegpu/data';
import { createRuntime, fullScreenVertexShaderOptions } from 'typegpu/web';

// Layout
const [video, canvas] = await Promise.all([
  addElement('video', { width: 500, height: 375 }),
  addElement('canvas', { width: 500, height: 375 }),
]);

const thresholdBuffer = wgsl.buffer(f32).$name('threshold').$allowUniform();

const thresholdData = thresholdBuffer.asUniform();

if (navigator.mediaDevices.getUserMedia) {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: true,
  });
}

const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const runtime = await createRuntime();
const device = runtime.device;

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const bindGroupLayout = device.createBindGroupLayout({
  entries: [
    {
      binding: 0,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      sampler: {},
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
      externalTexture: {},
    },
  ],
});

const renderProgram = runtime.makeRenderPipeline({
  vertex: fullScreenVertexShaderOptions,
  fragment: {
    args: ['@location(0) uv : vec2f'],
    code: wgsl`
      var color = textureSampleBaseClampToEdge(videoTexture, sampler_, uv);
      let grey = 0.299*color.r + 0.587*color.g + 0.114*color.b;

      if grey < ${thresholdData} {
        return vec4f(0, 0, 0, 1);
      }

      return vec4f(1);
    `,
    output: '@location(0) vec4f',
    target: [
      {
        format: presentationFormat,
      },
    ],
  },
  primitive: {
    topology: 'triangle-list',
  },
  externalLayouts: [bindGroupLayout],
  externalDeclarations: [
    wgsl`@group(0) @binding(0) var sampler_ : sampler;`,
    wgsl`@group(0) @binding(1) var videoTexture : texture_external;`,
  ],
});

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// UI

addParameter(
  'threshold',
  { initial: 0.4, min: 0, max: 1 },
  (threshold: number) => runtime.writeBuffer(thresholdBuffer, threshold),
);

onFrame(() => {
  if (!(video.currentTime > 0)) {
    return;
  }
  const resultTexture = device.importExternalTexture({
    source: video,
  });

  const bindGroup = device.createBindGroup({
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: sampler,
      },
      {
        binding: 1,
        resource: resultTexture,
      },
    ],
  });

  renderProgram.execute({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],

    vertexCount: 3,
    externalBindGroups: [bindGroup],
  });

  runtime.flush();
});
