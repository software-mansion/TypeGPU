import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const rareLayout = tgpu.bindGroupLayout({
  sampling: { sampler: 'filtering' },
  threshold: { uniform: d.f32 },
});

const frequentLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: {} },
});

const VertexOutput = d.struct({
  position: d.builtin.position,
  uv: d.location(0, d.vec2f),
});

const renderShaderCode = /* wgsl */ `

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
}`;

const video = document.querySelector('video') as HTMLVideoElement;
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const spinner = document.querySelector('.spinner-background') as HTMLDivElement;
canvas.parentElement?.appendChild(video);

function resizeVideo() {
  if (video.videoHeight === 0) {
    return;
  }

  const aspectRatio = video.videoWidth / video.videoHeight;
  video.style.height = `${video.clientWidth / aspectRatio}px`;
  if (canvas.parentElement) {
    canvas.parentElement.style.aspectRatio = `${aspectRatio}`;
    canvas.parentElement.style.height =
      `min(100cqh, calc(100cqw/(${aspectRatio})))`;
  }
}

const videoSizeObserver = new ResizeObserver(resizeVideo);
videoSizeObserver.observe(video);
video.addEventListener('resize', resizeVideo);

const root = await tgpu.init();
const device = root.device;

const sampler = root.device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const thresholdBuffer = root.createBuffer(d.f32).$usage('uniform');

const rareBindGroup = root.createBindGroup(rareLayout, {
  sampling: sampler,
  threshold: thresholdBuffer,
});

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
  code: tgpu.resolve({
    template: renderShaderCode,
    externals: {
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

let ready = false;
let frameRequest = requestAnimationFrame(run);

function run() {
  frameRequest = requestAnimationFrame(run);

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
  pass.setBindGroup(0, root.unwrap(rareBindGroup));
  pass.setBindGroup(
    1,
    root.unwrap(
      root.createBindGroup(frequentLayout, {
        inputTexture: device.importExternalTexture({ source: video }),
      }),
    ),
  );
  pass.draw(6);
  pass.end();

  device.queue.submit([encoder.finish()]);

  if (!ready) {
    device.queue.onSubmittedWorkDone().then(() => {
      spinner.style.display = 'none';
      ready = true;
    });
  }
}

// #region Example controls & Cleanup

export const controls = {
  threshold: {
    initial: 0.4,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (threshold: number) => thresholdBuffer.write(threshold),
  },
};

export function onCleanup() {
  cancelAnimationFrame(frameRequest);

  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }

  root.destroy();
  videoSizeObserver.disconnect();
}

// #endregion
