import { rgbToYcbcrMatrix } from '@typegpu/color';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const rareLayout = tgpu.bindGroupLayout({
  sampling: { sampler: 'filtering' },
  color: { uniform: d.vec3f },
  threshold: { uniform: d.f32 },
});

const frequentLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: {} },
});

const VertexOutput = d.struct({
  position: d.builtin.position,
  uv: d.location(0, d.vec2f),
});

const shaderCode = tgpu.resolve({
  template: /* wgsl */ `

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
  var col = textureSampleBaseClampToEdge(inputTexture, sampling, uv);

  let ycbcr = col.rgb * rgbToYcbcrMatrix;
  let colycbcr = color * rgbToYcbcrMatrix;

  let crDiff = abs(ycbcr.g - colycbcr.g);
  let cbDiff = abs(ycbcr.b - colycbcr.b);
  let distance = length(vec2f(crDiff, cbDiff));

  if (distance < pow(threshold, 2)) {
    col = vec4f();
  }

  return col;
}

`,
  externals: {
    ...rareLayout.bound,
    ...frequentLayout.bound,
    VertexOutput,
    rgbToYcbcrMatrix,
  },
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const video = document.querySelector('video') as HTMLVideoElement;

video.addEventListener('resize', () => {
  const aspectRatio = video.videoWidth / video.videoHeight;
  video.style.height = `${video.clientWidth / aspectRatio}px`;
  if (canvas.parentElement) {
    canvas.parentElement.style.aspectRatio = `${aspectRatio}`;
    canvas.parentElement.style.height =
      `min(100cqh, calc(100cqw/(${aspectRatio})))`;
  }
});

const width = video.width;
const height = video.height;

let stream: MediaStream;

if (navigator.mediaDevices.getUserMedia) {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: true,
  });
  video.srcObject = stream;
} else {
  throw new Error('getUserMedia not supported');
}

const root = await tgpu.init();
const device = root.device;

const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const samplingCanvas = document.createElement('canvas');
const samplingContext = samplingCanvas.getContext('2d');
samplingCanvas.width = width;
samplingCanvas.height = height;

if (!samplingContext) {
  throw new Error('Could not get 2d context');
}

const mediaProcessor = new MediaStreamTrackProcessor({
  track: stream.getVideoTracks()[0],
});
const reader = mediaProcessor.readable.getReader();

const thresholdBuffer = root.createBuffer(d.f32, 0.5).$usage('uniform');

const colorBuffer = root
  .createBuffer(d.vec3f, d.vec3f(0, 1.0, 0))
  .$usage('uniform');

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const rareBindGroup = root.createBindGroup(rareLayout, {
  color: colorBuffer,
  sampling: sampler,
  threshold: thresholdBuffer,
});

const shaderModule = device.createShaderModule({
  code: shaderCode,
});

const renderPipeline = device.createRenderPipeline({
  layout: device.createPipelineLayout({
    bindGroupLayouts: [root.unwrap(rareLayout), root.unwrap(frequentLayout)],
  }),
  vertex: {
    module: shaderModule,
  },
  fragment: {
    module: shaderModule,
    targets: [{ format: presentationFormat }],
  },
});

async function getFrame() {
  const { value: frame } = await reader.read();
  return frame;
}

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

async function drawFrame() {
  const frame = await getFrame();
  if (!frame) {
    return;
  }

  // Updating the target render texture
  (
    renderPassDescriptor.colorAttachments as [GPURenderPassColorAttachment]
  )[0].view = context.getCurrentTexture().createView();

  const encoder = device.createCommandEncoder();

  const pass = encoder.beginRenderPass(renderPassDescriptor);
  pass.setPipeline(renderPipeline);
  pass.setBindGroup(0, root.unwrap(rareBindGroup));
  pass.setBindGroup(
    1,
    root.unwrap(
      root.createBindGroup(frequentLayout, {
        inputTexture: device.importExternalTexture({ source: frame }),
      }),
    ),
  );
  pass.draw(6);
  pass.end();

  device.queue.submit([encoder.finish()]);
  frame.close();
}

let frameRequest = requestAnimationFrame(run);

function run() {
  frameRequest = requestAnimationFrame(run);

  if (video.currentTime > 0) {
    drawFrame();
  }
}

// #region Example controls & Cleanup

export const controls = {
  color: {
    onColorChange: (value: readonly [number, number, number]) => {
      colorBuffer.write(d.vec3f(...value));
    },
    initial: [0, 1, 0] as const,
  },
  threshold: {
    initial: 0.1,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value: number) => thresholdBuffer.write(value),
  },
};

export function onCleanup() {
  cancelAnimationFrame(frameRequest);

  for (const track of stream.getTracks()) {
    track.stop();
  }

  reader.cancel();
}

// #endregion
