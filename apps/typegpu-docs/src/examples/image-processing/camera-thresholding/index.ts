import { rgbToYcbcrMatrix } from '@typegpu/color';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const textureLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
});

const mainFrag = tgpu.fragmentFn({
  in: { uv: d.location(0, d.vec2f) },
  out: d.vec4f,
})((input) => {
  const uv2 = uvTransformUniform.$.mul(input.uv.sub(0.5)).add(0.5);
  let col = std.textureSampleBaseClampToEdge(
    textureLayout.$.inputTexture,
    sampler.$,
    uv2,
  );
  const ycbcr = col.rgb.mul(rgbToYcbcrMatrix.$);
  const colycbcr = colorUniform.$.mul(rgbToYcbcrMatrix.$);

  const crDiff = std.abs(ycbcr.y - colycbcr.y);
  const cbDiff = std.abs(ycbcr.z - colycbcr.z);
  const distance = std.length(d.vec2f(crDiff, cbDiff));

  if (distance < std.pow(thresholdBuffer.$, 2)) {
    col = d.vec4f();
  }

  return col;
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const video = document.querySelector('video') as HTMLVideoElement;
const spinner = document.querySelector('.spinner-background') as HTMLDivElement;

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

const root = await tgpu.init();
const device = root.device;

const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const thresholdBuffer = root.createUniform(d.f32, 0.5);
const colorUniform = root.createUniform(d.vec3f, d.vec3f(0, 1.0, 0));
const uvTransformUniform = root.createUniform(d.mat2x2f, d.mat2x2f.identity());

const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: mainFrag,
  targets: { format: presentationFormat },
});

function onVideoChange(size: { width: number; height: number }) {
  const aspectRatio = size.width / size.height;
  video.style.height = `${video.clientWidth / aspectRatio}px`;
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

  uvTransformUniform.write(m);
}

if (isIOS) {
  setUVTransformForIOS();
  window.addEventListener('orientationchange', setUVTransformForIOS);
}

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

  renderPipeline
    .withColorAttachment({
      view: context,
      clearValue: [1, 1, 1, 1],
    })
    .with(root.createBindGroup(textureLayout, {
      inputTexture: device.importExternalTexture({ source: video }),
    }))
    .draw(3);

  spinner.style.display = 'none';

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}
videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

// #region Example controls & Cleanup

export const controls = defineControls({
  color: {
    onColorChange: (value) => {
      colorUniform.write(value);
    },
    initial: d.vec3f(0, 1, 0),
  },
  threshold: {
    initial: 0.1,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => thresholdBuffer.write(value),
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
  root.destroy();
}

// #endregion
