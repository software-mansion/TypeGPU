/*
{
  "title": "Camera Thresholding",
  "category": "image-processing"
}
*/

// -- Hooks into the example environment
import { addElement, addParameter, onFrame } from '@typegpu/example-toolkit';
// --

import { builtin, createRuntime, wgsl } from 'typegpu';
import { f32, vec2f } from 'typegpu/data';

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

let resultTexture = wgsl.textureExternal({
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

  // TODO: Take this out of the loop - we don't want to create a pipeline every frame
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
        fragUV: vec2f,
      },
    },
    fragment: {
      code: wgsl`
        var color = textureSampleBaseClampToEdge(${resultTexture}, ${sampler}, fragUV);
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
  });

  resultTexture = wgsl.textureExternal({
    source: video,
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
  });

  runtime.flush();
});
