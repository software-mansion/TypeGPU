/*
{
  "title": "Camera Thresholding",
  "category": "image-processing"
}
*/

// -- Hooks into the example environment
import {
  addElement,
  addSliderParameter,
  onFrame,
} from '@typegpu/example-toolkit';
// --

import { createRuntime, fullScreenRectVertexOptions, wgsl } from 'typegpu';
import { f32 } from 'typegpu/data';

// Layout
const [video, canvas] = await Promise.all([
  addElement('video', { width: 500, height: 375 }),
  addElement('canvas', { width: 500, height: 375 }),
]);

const sampler = wgsl.sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const thresholdBuffer = wgsl.buffer(f32).$name('threshold').$allowUniform();

const thresholdData = thresholdBuffer.asUniform();

if (navigator.mediaDevices.getUserMedia) {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: true,
  });
}

const resultTexture = wgsl.textureExternal({
  source: video,
});

const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const runtime = await createRuntime();
const device = runtime.device;

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const renderProgram = runtime.makeRenderPipeline({
  vertex: fullScreenRectVertexOptions,
  fragment: {
    code: wgsl`
      var color = textureSampleBaseClampToEdge(${resultTexture}, ${sampler}, uv);
      let grey = 0.299*color.r + 0.587*color.g + 0.114*color.b;

      if grey < ${thresholdData} {
        return vec4f(0, 0, 0, 1);
      }

      return vec4f(1);
    `,
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

// UI

addSliderParameter(
  'threshold',
  0.4,
  { min: 0, max: 1, step: 0.1 },
  (threshold: number) => runtime.writeBuffer(thresholdBuffer, threshold),
);

onFrame(() => {
  if (!(video.currentTime > 0)) {
    return;
  }

  renderProgram.execute({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  runtime.flush();
});
