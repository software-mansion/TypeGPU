import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const textureLayout = tgpu.bindGroupLayout({
  inputTexture: { externalTexture: d.textureExternal() },
});

const vertexPos = tgpu.const(d.arrayOf(d.vec2f, 6), [
  d.vec2f(1.0, 1.0),
  d.vec2f(1.0, -1.0),
  d.vec2f(-1.0, -1.0),
  d.vec2f(1.0, 1.0),
  d.vec2f(-1.0, -1.0),
  d.vec2f(-1.0, 1.0),
]);

const uv = tgpu.const(d.arrayOf(d.vec2f, 6), [
  d.vec2f(1.0, 0.0),
  d.vec2f(1.0, 1.0),
  d.vec2f(0.0, 1.0),
  d.vec2f(1.0, 0.0),
  d.vec2f(0.0, 1.0),
  d.vec2f(0.0, 0.0),
]);

const mainVert = tgpu['~unstable'].vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { position: d.builtin.position, uv: d.location(0, d.vec2f) },
})((input, Out) => {
  const output = Out();
  output.position = d.vec4f(vertexPos.$[input.idx], 0.0, 1.0);
  output.uv = uv.$[input.idx];
  return output;
});

const mainFrag = tgpu['~unstable'].fragmentFn({
  in: { uv: d.location(0, d.vec2f) },
  out: d.vec4f,
})((input) => {
  const uv2 = uvTransformUniform.$.mul(input.uv.sub(0.5)).add(0.5);
  const col = std.textureSampleBaseClampToEdge(
    textureLayout.$.inputTexture,
    sampler,
    uv2,
  );

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

const root = await tgpu.init();
const device = root.device;

const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const uvTransformUniform = root.createUniform(d.mat2x2f, d.mat2x2f.identity());

const sampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const renderPipeline = root['~unstable']
  .withVertex(mainVert, {})
  .withFragment(mainFrag, { format: presentationFormat })
  .createPipeline();

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
let lastFrameSize: { width: number; height: number } | undefined = undefined;

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
      view: context.getCurrentTexture().createView(),
      clearValue: [1, 1, 1, 1],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(
      textureLayout,
      root.createBindGroup(textureLayout, {
        inputTexture: device.importExternalTexture({ source: video }),
      }),
    )
    .draw(6);

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}
videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

// #region Example controls & Cleanup

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
