// -- Hooks into the example environment
import { onFrame } from '@typegpu/example-toolkit';
// --

import { f32, vec2f } from 'typegpu/data';
import tgpu, { asUniform, builtin, wgsl } from 'typegpu/experimental';

// Layout
const video = document.querySelector('video') as HTMLVideoElement;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const sampler = wgsl.sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const root = await tgpu.init();

const thresholdBuffer = root
  .createBuffer(f32)
  .$name('threshold')
  .$usage('uniform');

const thresholdData = asUniform(thresholdBuffer);

if (navigator.mediaDevices.getUserMedia) {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: true,
  });
}

const resultTexture = wgsl.textureExternal(video);

const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const renderProgram = root.makeRenderPipeline({
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
      [builtin.position.s]: 'Position',
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

// #region UI

export const controls = {
  threshold: {
    initial: 0.4,
    min: 0,
    max: 1,
    step: 0.1,
    onSliderChange: (threshold: number) => thresholdBuffer.write(threshold),
  },
};

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

    vertexCount: 6,
  });

  root.flush();
});

export function onCleanup() {
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }

  root.destroy();
  root.device.destroy();
}

// #endregion
