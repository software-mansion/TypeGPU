/*
{
  "title": "Camera Thresholding"
}
*/

import { addElement, addParameter, onFrame } from '@wigsill/example-toolkit';
import {
  createRuntime,
  f32,
  struct,
  vec2f,
  vec4f,
  wgsl,
  builtin,
} from 'wigsill';

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

const outputStruct = struct({
  '@builtin(position) Position': vec4f,
  '@location(0) fragUV': vec2f,
});

const renderProgram = runtime.makeRenderPipeline({
  vertex: {
    code: wgsl`
      const pos = array(
        vec2( 1.0,  1.0),
        vec2( 1.0, -1.0),
        vec2(-1.0, -1.0),
        vec2( 1.0,  1.0),
        vec2(-1.0, -1.0),
        vec2(-1.0,  1.0),
      );

      const uv = array(
        vec2(1.0, 0.0),
        vec2(1.0, 1.0),
        vec2(0.0, 1.0),
        vec2(1.0, 0.0),
        vec2(0.0, 1.0),
        vec2(0.0, 0.0),
      );

      let Position = vec4(pos[${builtin.vertexIndex}], 0.0, 1.0);
      let fragUV = uv[${builtin.vertexIndex}];
    `,
    output: {
      [builtin.position]: 'Position',
      fragUV: [vec2f, 'fragUV'],
    },
  },
  fragment: {
    code: wgsl`
      var color = textureSampleBaseClampToEdge(videoTexture, sampler_, fragUV);
      let grey = 0.299*color.r + 0.587*color.g + 0.114*color.b;

      if grey < ${thresholdData} {
        return vec4f(0, 0, 0, 1);
      }

      return vec4f(1);
    `,
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
  (threshold: number) => thresholdBuffer.write(runtime, threshold),
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

    vertexCount: 6,
    externalBindGroups: [bindGroup],
  });

  runtime.flush();
});
