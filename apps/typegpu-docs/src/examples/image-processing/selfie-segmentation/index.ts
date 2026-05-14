import tgpu, { common, d, std } from 'typegpu';
import type { StorageFlag, TgpuBuffer } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { MODEL_HEIGHT, MODEL_WIDTH, SelfieSegmenterInference } from './inference.ts';
import type { VideoFrameCrop } from './inference.ts';
import { MaskPostProcessor } from './mask-postprocess.ts';

type MaskBuffer = TgpuBuffer<d.WgslArray<d.Vec4f>> & StorageFlag;

const compositeParams = d.struct({
  sourceSize: d.vec2u,
  cropOrigin: d.vec2f,
  cropSize: d.vec2f,
});

const compositeLayout = tgpu.bindGroupLayout({
  params: { uniform: compositeParams },
  frame: { externalTexture: d.textureExternal() },
  sampler: { sampler: 'filtering' },
  mask: { storage: d.arrayOf(d.vec4f) },
});

const maskIndex = (coord: d.v2u) => {
  'use gpu';
  return coord.y * MODEL_WIDTH + coord.x;
};

const sampleMask = (uv: d.v2f) => {
  'use gpu';
  const src = uv * d.vec2f(MODEL_WIDTH, MODEL_HEIGHT) - 0.5;
  const base = std.floor(src);
  const lerp = src - base;
  const maxCoord = d.vec2f(MODEL_WIDTH - 1, MODEL_HEIGHT - 1);
  const p0 = d.vec2u(std.clamp(base, d.vec2f(0), maxCoord));
  const p1 = d.vec2u(std.clamp(base + 1, d.vec2f(0), maxCoord));
  const top = std.mix(
    compositeLayout.$.mask[maskIndex(p0)].x,
    compositeLayout.$.mask[maskIndex(d.vec2u(p1.x, p0.y))].x,
    lerp.x,
  );
  const bottom = std.mix(
    compositeLayout.$.mask[maskIndex(d.vec2u(p0.x, p1.y))].x,
    compositeLayout.$.mask[maskIndex(p1)].x,
    lerp.x,
  );
  return std.mix(top, bottom, lerp.y);
};

export const compositeFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const cropUv = d.vec2f(1 - uv.x, uv.y);
  const sourcePixel =
    compositeLayout.$.params.cropOrigin + cropUv * compositeLayout.$.params.cropSize;
  const cameraUv = sourcePixel / d.vec2f(compositeLayout.$.params.sourceSize);
  const cameraColor = std.textureSampleBaseClampToEdge(
    compositeLayout.$.frame,
    compositeLayout.$.sampler,
    cameraUv,
  );
  const personAlpha = std.smoothstep(0.28, 0.72, sampleMask(uv));
  const vertical = std.mix(d.vec3f(0.09, 0.2, 0.62), d.vec3f(0.96, 0.3, 0.45), uv.y);
  const gradient = std.mix(vertical, d.vec3f(1, 0.84, 0.38), uv.x * 0.35);
  return d.vec4f(std.mix(gradient, cameraColor.rgb, personAlpha), 1);
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const video = document.createElement('video');
video.autoplay = true;
video.muted = true;
video.playsInline = true;

if (!navigator.mediaDevices?.getUserMedia) {
  throw new Error('getUserMedia not supported');
}

const root = await tgpu.init();
const inference = await SelfieSegmenterInference.create(root);
const postProcessor = new MaskPostProcessor(root, inference.maskBuffer);
const format = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({ canvas, format, alphaMode: 'premultiplied' });
const sampler = root.createSampler({
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
  magFilter: 'linear',
  minFilter: 'linear',
});
const compositeParamsBuffer = root
  .createBuffer(compositeParams, {
    sourceSize: d.vec2u(1, 1),
    cropOrigin: d.vec2f(0),
    cropSize: d.vec2f(1),
  })
  .$usage('uniform');
const compositePipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: compositeFragment,
  targets: { format },
});

video.srcObject = await navigator.mediaDevices.getUserMedia({
  video: {
    facingMode: 'user',
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 60 },
  },
  audio: false,
});

let videoFrameCallbackId: number | undefined;
let postProcessingEnabled = true;

function processVideoFrame(_: number, metadata: VideoFrameCallbackMetadata) {
  if (video.readyState < 2) {
    videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
    return;
  }

  resizeCanvas();
  const crop = squareCrop(metadata.width, metadata.height);
  const externalTexture = root.device.importExternalTexture({ source: video });
  const encoder = root.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  inference.encodeVideoFrame(pass, externalTexture, crop);
  if (postProcessingEnabled) {
    postProcessor.encode(pass);
  }
  pass.end();
  renderComposite(
    encoder,
    externalTexture,
    postProcessingEnabled ? postProcessor.outputBuffer : inference.maskBuffer,
    crop,
  );
  root.device.queue.submit([encoder.finish()]);

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}

videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

function squareCrop(sourceWidth: number, sourceHeight: number): VideoFrameCrop {
  const size = Math.min(sourceWidth, sourceHeight);
  return {
    sourceWidth,
    sourceHeight,
    x: Math.floor((sourceWidth - size) / 2),
    y: Math.floor((sourceHeight - size) / 2),
    width: size,
    height: size,
  };
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
  const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export const controls = defineControls({
  'post processing': {
    initial: postProcessingEnabled,
    onToggleChange: setPostProcessingEnabled,
  },
});

export function onCleanup() {
  if (videoFrameCallbackId !== undefined) {
    video.cancelVideoFrameCallback(videoFrameCallbackId);
  }
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }
  video.srcObject = null;
  root.destroy();
}

function setPostProcessingEnabled(enabled: boolean) {
  postProcessingEnabled = enabled;
  if (enabled) {
    postProcessor.reset();
  }
}

function renderComposite(
  encoder: GPUCommandEncoder,
  externalTexture: GPUExternalTexture,
  maskBuffer: MaskBuffer,
  crop: VideoFrameCrop,
) {
  compositeParamsBuffer.write({
    sourceSize: d.vec2u(crop.sourceWidth, crop.sourceHeight),
    cropOrigin: d.vec2f(crop.x, crop.y),
    cropSize: d.vec2f(crop.width, crop.height),
  });
  compositePipeline
    .with(encoder)
    .with(
      root.createBindGroup(compositeLayout, {
        params: compositeParamsBuffer,
        frame: externalTexture,
        sampler,
        mask: maskBuffer,
      }),
    )
    .withColorAttachment({
      view: context,
      clearValue: [0, 0, 0, 1],
    })
    .draw(3);
}
