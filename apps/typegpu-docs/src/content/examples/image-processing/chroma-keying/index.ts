import { f32, location, struct, vec2f, vec3f } from 'typegpu/data';
import tgpu, { builtin } from 'typegpu/experimental';

const rareLayout = tgpu.bindGroupLayout({
  sampling: { sampler: 'filtering' },
  color: { uniform: vec3f },
  threshold: { uniform: f32 },
});

const frequentLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: {} },
});

const VertexOutput = struct({
  position: builtin.position,
  uv: location(0, vec2f),
});

const shaderCode = /* wgsl */ `

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

const rgb_to_ycbcr_matrix = mat3x3f(
  0.299,     0.587,     0.114,
 -0.168736, -0.331264,  0.5,
  0.5,      -0.418688, -0.081312,
);

fn rgb_to_ycbcr(rgb: vec3f) -> vec3f {
 return rgb * rgb_to_ycbcr_matrix;
}

@fragment
fn main_frag(@location(0) uv: vec2f) -> @location(0) vec4f {
  var col = textureSampleBaseClampToEdge(inputTexture, sampling, uv);

  let ycbcr = col.rgb * rgb_to_ycbcr_matrix;
  let colycbcr = color * rgb_to_ycbcr_matrix;

  let crDiff = abs(ycbcr.g - colycbcr.g);
  let cbDiff = abs(ycbcr.b - colycbcr.b);
  let distance = length(vec2f(crDiff, cbDiff));

  if (distance < pow(threshold, 2)) {
    col = vec4f();
  }

  return col;
}`;

const width = 500;
const height = 375;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const video = document.querySelector('video') as HTMLVideoElement;

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

const thresholdBuffer = root
  .createBuffer(f32, 0.5)
  .$name('threshold')
  .$usage('uniform');

const colorBuffer = root
  .createBuffer(vec3f, vec3f(0, 1.0, 0))
  .$name('color')
  .$usage('uniform');

const sampler = device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const rareBindGroup = rareLayout.populate({
  color: colorBuffer,
  sampling: sampler,
  threshold: thresholdBuffer,
});

const shaderModule = device.createShaderModule({
  code: tgpu.resolve({
    input: shaderCode,
    extraDependencies: {
      ...rareLayout.bound,
      ...frequentLayout.bound,
      VertexOutput,
    },
  }),
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
      frequentLayout.populate({
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

// #region UI

const table = document.querySelector('.rgb') as HTMLDivElement;

video.addEventListener('click', (event) => {
  const { offsetX: x, offsetY: y } = event;

  // Sampling the video frame
  samplingContext.drawImage(video, 0, 0, width, height);
  const [r, g, b] = samplingContext.getImageData(x, y, 1, 1).data;

  table.innerText = `R: ${r} G: ${g} B: ${b}`;
  colorBuffer.write(vec3f(r / 255, g / 255, b / 255));
});

// #endregion

// #region Example Controls & Cleanup

export const controls = {
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
