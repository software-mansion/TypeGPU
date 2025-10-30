import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const rareLayout = tgpu.bindGroupLayout({
  sampling: { sampler: 'filtering' },
  threshold: { uniform: d.f32 },
  uvTransform: { uniform: d.mat2x2f },
});

const frequentLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
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
  let uv2 = uvTransform * (uv - vec2f(0.5)) + vec2f(0.5);
  var color = textureSampleBaseClampToEdge(inputTexture, sampling, uv2);
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

const root = await tgpu.init();
const device = root.device;

const sampler = root.device.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const thresholdBuffer = root.createBuffer(d.f32).$usage('uniform');

const uvTransformBuffer = root
  .createBuffer(d.mat2x2f, d.mat2x2f.identity())
  .$usage('uniform');

const rareBindGroup = root.createBindGroup(rareLayout, {
  sampling: sampler,
  threshold: thresholdBuffer,
  uvTransform: uvTransformBuffer,
});

if (navigator.mediaDevices.getUserMedia) {
  video.srcObject = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'user',
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 },
    },
  });
} else {
  throw new Error('getUserMedia not supported');
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

function onVideoChange(size: { width: number; height: number }) {
  const aspectRatio = size.width / size.height;
  if (canvas.parentElement) {
    canvas.parentElement.style.aspectRatio = `${aspectRatio}`;
    canvas.parentElement.style.height =
      `min(100cqh, calc(100cqw/(${aspectRatio})))`;
  }
}

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
function setUVTransformForIOS() {
  const angle = screen.orientation.type;

  let m = d.mat2x2f(1, 0, 0, 1);
  if (angle === 'portrait-primary') {
    m = d.mat2x2f(0, -1, 1, 0);
  } else if (angle === 'portrait-secondary') {
    m = d.mat2x2f(0, 1, -1, 0);
  } else if (angle === 'landscape-primary') {
    m = d.mat2x2f(-1, 0, 0, -1);
  }

  uvTransformBuffer.write(m);
}

if (isIOS) {
  setUVTransformForIOS();
  window.addEventListener('orientationchange', setUVTransformForIOS);
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

let videoFrameCallbackId: number | undefined;
let lastFrameSize: { width: number; height: number } | undefined;

function processVideoFrame(
  _: number,
  metadata: VideoFrameCallbackMetadata,
) {
  if (video.readyState < 2) {
    videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
    return;
  }

  const frameWidth = metadata.width;
  const frameHeight = metadata.height;

  if (
    !lastFrameSize ||
    lastFrameSize.width !== frameWidth ||
    lastFrameSize.height !== frameHeight
  ) {
    lastFrameSize = { width: frameWidth, height: frameHeight };
    onVideoChange(lastFrameSize);
  }

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

  spinner.style.display = 'none';

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}

videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

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
  if (videoFrameCallbackId !== undefined) {
    video.cancelVideoFrameCallback(videoFrameCallbackId);
  }
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }

  root.destroy();
}

// #endregion
