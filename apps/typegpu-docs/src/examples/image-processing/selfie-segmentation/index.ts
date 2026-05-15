import tgpu, { common, d, std } from 'typegpu';
import type { TgpuTextureView } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { SelfieSegmenterInference } from './inference.ts';
import type { VideoFrameCrop } from './inference.ts';
import {
  MaskPostProcessor,
  maskPostProcessProfiles,
  type MaskPostProcessProfile,
} from './mask-postprocess.ts';

type MaskView = TgpuTextureView<d.WgslTexture2d<d.F32>>;

const compositeParams = d.struct({
  sourceSize: d.vec2u,
  cropOrigin: d.vec2f,
  cropSize: d.vec2f,
});

const compositeLayout = tgpu.bindGroupLayout({
  params: { uniform: compositeParams },
  frame: { externalTexture: d.textureExternal() },
  sampler: { sampler: 'filtering' },
  mask: { texture: d.texture2d(d.f32) },
});

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
  const personMask = std.textureSampleBaseClampToEdge(
    compositeLayout.$.mask,
    compositeLayout.$.sampler,
    uv,
  ).r;
  const personAlpha = std.smoothstep(0.35, 0.65, personMask);
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

let videoFrameCallbackId = 0;
let postProcessProfile: MaskPostProcessProfile = 'balanced';

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
  postProcessor.encode(
    pass,
    externalTexture,
    crop,
    { width: canvas.width, height: canvas.height },
    postProcessProfile,
  );
  pass.end();
  renderComposite(encoder, externalTexture, postProcessor.maskView, crop);
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
    initial: postProcessProfile,
    options: maskPostProcessProfiles,
    onSelectChange: setPostProcessProfile,
  },
});

export function onCleanup() {
  video.cancelVideoFrameCallback(videoFrameCallbackId);
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }
  video.srcObject = null;
  root.destroy();
}

function setPostProcessProfile(profile: MaskPostProcessProfile) {
  postProcessProfile = profile;
  postProcessor.reset();
}

function renderComposite(
  encoder: GPUCommandEncoder,
  externalTexture: GPUExternalTexture,
  maskTexture: MaskView,
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
        mask: maskTexture,
      }),
    )
    .withColorAttachment({
      view: context,
      clearValue: [0, 0, 0, 1],
    })
    .draw(3);
}
