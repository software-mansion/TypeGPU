// -- Hooks into the example environment
import { onCleanup, onFrame } from '@typegpu/example-toolkit';
// --

import { f32 } from 'typegpu/data';
import tgpu from 'typegpu/experimental';

const layout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: {} },
  sampling: { sampler: 'filtering' },
  threshold: { uniform: f32 },
});

const renderShaderCode = /* wgsl */ `

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var inputTexture: texture_external;
@group(0) @binding(1) var sampling: sampler;
@group(0) @binding(2) var<uniform> threshold: f32;

@vertex
fn main_vert(@builtin(vertex_index) idx: u32) -> VertexOutput {
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

  var output: VertexOutput;
  output.position = vec4(pos[idx], 0.0, 1.0);
  output.uv = uv[idx];
  return output;
}

@fragment
fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
  var color = textureSampleBaseClampToEdge(inputTexture, sampling, uv);
  let grey = 0.299*color.r + 0.587*color.g + 0.114*color.b;

  if (grey < threshold) {
    return vec4f(0, 0, 0, 1);
  }

  return vec4f(1);
}

`;

const video = document.querySelector('video') as HTMLVideoElement;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const root = await tgpu.init();
const device = root.device;

const sampler = root.device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const thresholdBuffer = root
  .createBuffer(f32)
  .$name('threshold')
  .$usage('uniform');

if (navigator.mediaDevices.getUserMedia) {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: true,
  });
}

const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const renderShaderModule = device.createShaderModule({
  code: renderShaderCode,
});

const renderPipeline = device.createRenderPipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(layout)],
  }),
  vertex: {
    module: renderShaderModule,
  },
  fragment: {
    module: renderShaderModule,
    targets: [{ format: presentationFormat }],
  },
});

const renderPassDescriptor: GPURenderPassDescriptor = {
  colorAttachments: [
    {
      view: undefined as unknown as GPUTextureView,
      clearValue: [1, 1, 1, 1],
      loadOp: 'clear' as const,
      storeOp: 'store' as const,
    },
  ],
};

onFrame(() => {
  if (!(video.currentTime > 0)) {
    return;
  }

  // Updating the target render texture
  (
    renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachment]
  )[0].view = context.getCurrentTexture().createView();

  const encoder = device.createCommandEncoder();

  const pass = encoder.beginRenderPass(renderPassDescriptor);
  pass.setPipeline(renderPipeline);
  pass.setBindGroup(
    0,
    root.unwrap(
      layout.populate({
        inputTexture: device.importExternalTexture({ source: video }),
        sampling: sampler,
        threshold: thresholdBuffer,
      }),
    ),
  );
  pass.draw(6);
  pass.end();

  device.queue.submit([encoder.finish()]);
});

onCleanup(() => {
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }

  root.destroy();
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

// #endregion
