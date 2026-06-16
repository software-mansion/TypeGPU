import tgpu, { common, d, std } from 'typegpu';
import type { TgpuBindGroup } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import {
  FrameCropParams,
  initialFrameCropParams,
  squareCrop,
  type VideoFrameCrop,
} from './frame.ts';
import { SelfieSegmenterInference } from './inference/segmenter.ts';
import { MaskPostProcessor } from './post-processing/processor.ts';
import {
  maskPostProcessProfiles,
  type MaskPostProcessProfile,
  type SampledMaskView,
} from './post-processing/types.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });
const video = document.querySelector('video') as HTMLVideoElement;

const detachAutoResizer = common.attachAutoResizer({
  root,
  canvas,
  onResize() {
    // Keeping the aspect ratio 1:1
    const size = Math.min(canvas.width, canvas.height);
    canvas.width = size;
    canvas.height = size;
  },
});

const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const PERSON_ALPHA_LOW = 0.35;
const PERSON_ALPHA_HIGH = 0.65;

const compositeUniform = root.createUniform(FrameCropParams, initialFrameCropParams);

const compositeFrameLayout = tgpu.bindGroupLayout({
  frame: { externalTexture: d.textureExternal() },
});

const compositeMaskLayout = tgpu.bindGroupLayout({
  mask: { texture: d.texture2d() },
});

const sampleMask = (uv: d.v2f) => {
  'use gpu';
  return std.textureSample(compositeMaskLayout.$.mask, sampler.$, uv).r;
};

const sampleFeatheredMask = (uv: d.v2f) => {
  'use gpu';
  const texel = 1 / d.vec2f(std.textureDimensions(compositeMaskLayout.$.mask));
  const center = sampleMask(uv) * 4;
  const cardinal =
    (sampleMask(uv + d.vec2f(texel.x, 0)) +
      sampleMask(uv - d.vec2f(texel.x, 0)) +
      sampleMask(uv + d.vec2f(0, texel.y)) +
      sampleMask(uv - d.vec2f(0, texel.y))) *
    2;
  const diagonal =
    sampleMask(uv + texel) +
    sampleMask(uv - texel) +
    sampleMask(uv + d.vec2f(texel.x, -texel.y)) +
    sampleMask(uv + d.vec2f(-texel.x, texel.y));

  return (center + cardinal + diagonal) * 0.0625;
};

export const compositeFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const cropUv = d.vec2f(1 - uv.x, uv.y);
  const sourcePixel = compositeUniform.$.cropOrigin + cropUv * compositeUniform.$.cropSize;
  const sourceUv = sourcePixel / d.vec2f(compositeUniform.$.sourceSize);
  const cameraUv = compositeUniform.$.uvTransform * (sourceUv - 0.5) + 0.5;
  const cameraColor = std.textureSampleBaseClampToEdge(
    compositeFrameLayout.$.frame,
    sampler.$,
    cameraUv,
  );
  const personMask = sampleFeatheredMask(uv);
  const personAlpha = std.smoothstep(PERSON_ALPHA_LOW, PERSON_ALPHA_HIGH, personMask);
  const vertical = std.mix(d.vec3f(0.09, 0.2, 0.62), d.vec3f(0.96, 0.3, 0.45), uv.y);
  const gradient = std.mix(vertical, d.vec3f(1, 0.84, 0.38), uv.x * 0.35);
  return d.vec4f(std.mix(gradient, cameraColor.rgb, personAlpha), 1);
});

if (!navigator.mediaDevices?.getUserMedia) {
  throw new Error('getUserMedia not supported');
}

const inference = await SelfieSegmenterInference.create(root);
const postProcessor = new MaskPostProcessor(root, inference.maskBuffer);
const compositePipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: compositeFragment,
});
let compositeMaskView: SampledMaskView | undefined;
let compositeMaskBindGroup: TgpuBindGroup<typeof compositeMaskLayout.entries> | undefined;

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
let uvTransform = d.mat2x2f.identity();

const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
function setUVTransformForIOS() {
  const angle = screen.orientation.type;

  uvTransform = d.mat2x2f.identity();
  if (angle === 'portrait-primary') {
    uvTransform = d.mat2x2f(0, -1, 1, 0);
  } else if (angle === 'portrait-secondary') {
    uvTransform = d.mat2x2f(0, 1, -1, 0);
  } else if (angle === 'landscape-primary') {
    uvTransform = d.mat2x2f(-1, 0, 0, -1);
  }
}

if (isIOS) {
  setUVTransformForIOS();
  window.addEventListener('orientationchange', setUVTransformForIOS);
}

function processVideoFrame(_: number, metadata: VideoFrameCallbackMetadata) {
  if (video.readyState < 2) {
    videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
    return;
  }
  const crop = squareCrop(metadata.width, metadata.height, uvTransform);
  const externalTexture = root.device.importExternalTexture({ source: video });
  const encoder = root.device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  inference.encodeVideoFrame(pass, externalTexture, crop);
  postProcessor.encode(pass, externalTexture, crop, canvas, postProcessProfile);
  pass.end();
  renderComposite(encoder, externalTexture, postProcessor.maskView, crop);
  root.device.queue.submit([encoder.finish()]);

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}

videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

function renderComposite(
  encoder: GPUCommandEncoder,
  externalTexture: GPUExternalTexture,
  maskTexture: SampledMaskView,
  crop: VideoFrameCrop,
) {
  compositeUniform.write(crop);
  compositePipeline
    .with(encoder)
    .with(root.createBindGroup(compositeFrameLayout, { frame: externalTexture }))
    .with(compositeMaskBindGroupFor(maskTexture))
    .withColorAttachment({ view: context })
    .draw(3);
}

function compositeMaskBindGroupFor(
  maskTexture: SampledMaskView,
): TgpuBindGroup<typeof compositeMaskLayout.entries> {
  if (compositeMaskView === maskTexture && compositeMaskBindGroup) {
    return compositeMaskBindGroup;
  }

  compositeMaskView = maskTexture;
  compositeMaskBindGroup = root.createBindGroup(compositeMaskLayout, {
    mask: maskTexture,
  });
  return compositeMaskBindGroup;
}

function setPostProcessProfile(profile: MaskPostProcessProfile) {
  postProcessProfile = profile;
  postProcessor.reset();
}

// #region Example controls & Cleanup

export const controls = defineControls({
  'post processing': {
    initial: postProcessProfile,
    options: maskPostProcessProfiles,
    onSelectChange: setPostProcessProfile,
  },
});

export function onCleanup() {
  video.cancelVideoFrameCallback(videoFrameCallbackId);
  detachAutoResizer();
  if (isIOS) {
    window.removeEventListener('orientationchange', setUVTransformForIOS);
  }
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }
  video.srcObject = null;
  root.destroy();
}

// #endregion
