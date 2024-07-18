/*
{
  "title": "Camera Thresholding"
}
*/

import { addElement, addParameter, onFrame } from '@wigsill/example-toolkit';
import { ProgramBuilder, createRuntime, f32, makeArena, wgsl } from 'wigsill';

// Layout
const [video, canvas] = await Promise.all([
  addElement('video', { width: 500, height: 375 }),
  addElement('canvas', { width: 500, height: 375 }),
]);
const thresholdData = wgsl.memory(f32).$name('threshold');

const shaderCode = wgsl`
@group(0) @binding(0) var sampler_ : sampler;
@group(0) @binding(1) var videoTexture : texture_external;

struct VertexOutput {
  @builtin(position) Position : vec4f,
  @location(0) fragUV : vec2f,
}

@vertex
fn vert_main(@builtin(vertex_index) VertexIndex: u32) -> VertexOutput {
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

  var output : VertexOutput;
  output.Position = vec4(pos[VertexIndex], 0.0, 1.0);
  output.fragUV = uv[VertexIndex];
  return output;
}

@fragment
fn frag_main(@location(0) fragUV : vec2f) -> @location(0) vec4f {
  var color = textureSampleBaseClampToEdge(videoTexture, sampler_, fragUV);
  let grey = 0.299*color.r + 0.587*color.g + 0.114*color.b;

  if grey < ${thresholdData} {
    return vec4f(0, 0, 0, 1);
  }

  return vec4f(1);
}
`;

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

const arena = makeArena({
  bufferBindingType: 'uniform',
  memoryEntries: [thresholdData],
  usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
});

const program = new ProgramBuilder(runtime, shaderCode).build({
  bindingGroup: 1,
  shaderStage: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
  arenas: [arena],
});

const shaderModule = device.createShaderModule({
  code: program.code,
});

const layout = device.createPipelineLayout({
  bindGroupLayouts: [
    device.createBindGroupLayout({
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
    }),
    program.bindGroupLayout,
  ],
});

const renderPipeline = device.createRenderPipeline({
  layout: layout,
  vertex: {
    module: shaderModule,
  },
  fragment: {
    module: shaderModule,
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

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// UI

addParameter(
  'threshold',
  { initial: 0.4, min: 0, max: 1 },
  (threshold: number) => thresholdData.write(runtime, threshold),
);

onFrame(() => {
  if (!(video.currentTime > 0)) {
    return;
  }

  const resultTexture = device.importExternalTexture({
    source: video,
  });

  const bindGroup = device.createBindGroup({
    layout: renderPipeline.getBindGroupLayout(0),
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

  const commandEncoder = device.createCommandEncoder();

  const passEncoder = commandEncoder.beginRenderPass({
    colorAttachments: [
      {
        view: context.getCurrentTexture().createView(),
        clearValue: [0, 0, 0, 1],
        loadOp: 'clear',
        storeOp: 'store',
      },
    ],
  });

  passEncoder.setPipeline(renderPipeline);
  passEncoder.setBindGroup(0, bindGroup);
  passEncoder.setBindGroup(1, program.bindGroup);
  passEncoder.draw(6);
  passEncoder.end();
  device.queue.submit([commandEncoder.finish()]);
});
