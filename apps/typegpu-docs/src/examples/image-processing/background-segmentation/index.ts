import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import {
  drawWithMaskFragment,
  fullScreenTriangle,
  prepareModelInput,
} from './shaders.ts';
import {
  drawWithMaskLayout,
  maskSlot,
  prepareModelInputLayout,
  samplerSlot,
} from './schemas.ts';
import { prepareSession } from './model.ts';

// setup

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

const adapter = await navigator.gpu?.requestAdapter();
const device = await adapter?.requestDevice({ label: 'my device' });
if (!device) {
  throw new Error('Failed to initialize device.');
}

navigator.gpu.requestAdapter = async () => adapter;
adapter!.requestDevice = async () => device;
const root = await tgpu.initFromDevice({ device });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// resources

const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const maskTexture = root['~unstable'].createTexture({
  size: [256, 256],
  format: 'rgba8unorm',
}).$usage('sampled', 'render', 'storage');

const modelInputBuffer = root
  .createBuffer(d.arrayOf(d.f32, 3 * 256 * 256))
  .$usage('storage');

const modelOutputBuffer = root.createMutable(d.arrayOf(d.f32, 1 * 256 * 256));

const generateMaskTextureFragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f, pos: d.builtin.position },
  out: d.vec4f,
})(({ uv, pos }) => {
  const x = d.u32(pos.x);
  const y = d.u32(pos.y);

  return d.vec4f(modelOutputBuffer.$[y * 256 + x]);
});

const generateMaskTexturePipeline = root['~unstable']
  .with(samplerSlot, sampler)
  .withVertex(fullScreenTriangle, {})
  .withFragment(generateMaskTextureFragment, { format: 'rgba8unorm' })
  .createPipeline();

const downscalePipeline = root['~unstable'].prepareDispatch(prepareModelInput);

const renderPipeline = root['~unstable']
  .with(samplerSlot, sampler)
  .with(maskSlot, modelOutputBuffer)
  .withVertex(fullScreenTriangle, {})
  .withFragment(drawWithMaskFragment, { format: presentationFormat })
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

// other

const runSession = await prepareSession(
  root.unwrap(modelInputBuffer),
  root.unwrap(modelOutputBuffer.buffer),
);

let videoFrameCallbackId: number | undefined;
let lastFrameSize: { width: number; height: number } | undefined = undefined;

async function processVideoFrame(
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

  downscalePipeline
    .with(root.createBindGroup(prepareModelInputLayout, {
      inputTexture: device!.importExternalTexture({ source: video }),
      outputBuffer: modelInputBuffer,
      sampler,
    }))
    .dispatchThreads(256, 256);

  root['~unstable'].flush();

  await runSession();

  generateMaskTexturePipeline
    .withColorAttachment({
      view: root.unwrap(maskTexture.createView()),
      clearValue: [1, 1, 1, 1],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  renderPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [1, 1, 1, 1],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(root.createBindGroup(drawWithMaskLayout, {
      inputTexture: device!.importExternalTexture({ source: video }),
      maskTexture: maskTexture,
    }))
    .draw(3);

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
