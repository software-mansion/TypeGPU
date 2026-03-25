import { rgbToYcbcrMatrix } from '@typegpu/color';
import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const device = root.device;

const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const color = root.createUniform(d.vec3f, d.vec3f(0, 1.0, 0));
const threshold = root.createUniform(d.f32, 0.5);
const uvTransform = root.createUniform(d.mat2x2f, d.mat2x2f.identity());

const layout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
});

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const uv2 = uvTransform.$.mul(uv.sub(0.5)).add(0.5);
  const col = std.textureSampleBaseClampToEdge(layout.$.inputTexture, sampler.$, uv2);
  const ycbcr = col.rgb.mul(rgbToYcbcrMatrix.$);
  const colycbcr = color.$.mul(rgbToYcbcrMatrix.$);

  const crDiff = std.abs(ycbcr.y - colycbcr.y);
  const cbDiff = std.abs(ycbcr.z - colycbcr.z);
  const distance = std.length(d.vec2f(crDiff, cbDiff));

  if (distance < threshold.$ ** 2) {
    return d.vec4f();
  }

  return col;
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const video = document.querySelector('video') as HTMLVideoElement;

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

const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment,
  targets: { format: presentationFormat },
});

function onVideoChange(size: { width: number; height: number }) {
  const aspectRatio = size.width / size.height;
  video.style.height = `${video.clientWidth / aspectRatio}px`;
  if (canvas.parentElement) {
    canvas.parentElement.style.aspectRatio = `${aspectRatio}`;
    canvas.parentElement.style.height = `min(100cqh, calc(100cqw/(${aspectRatio})))`;
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

  uvTransform.write(m);
}

if (isIOS) {
  setUVTransformForIOS();
  window.addEventListener('orientationchange', setUVTransformForIOS);
}

let videoFrameCallbackId: number | undefined;
let lastFrameSize: { width: number; height: number } | undefined;

function processVideoFrame(_: number, metadata: VideoFrameCallbackMetadata) {
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

  const group = root.createBindGroup(layout, {
    inputTexture: device.importExternalTexture({ source: video }),
  });

  renderPipeline.with(group).withColorAttachment({ view: context }).draw(3);

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}

videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

// #region Example controls & Cleanup

export const controls = defineControls({
  color: {
    initial: d.vec3f(0, 1, 0),
    onColorChange: (value) => {
      color.write(value);
    },
  },
  threshold: {
    initial: 0.1,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value) => threshold.write(value),
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
