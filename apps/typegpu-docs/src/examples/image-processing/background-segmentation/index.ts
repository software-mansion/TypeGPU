import tgpu, {
  type RenderFlag,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuTexture,
} from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import { MODEL_HEIGHT, MODEL_WIDTH, prepareSession } from './model.ts';
import {
  blockDim,
  blurLayout,
  drawWithMaskLayout,
  generateMaskLayout,
  prepareModelInputLayout,
} from './schemas.ts';
import {
  computeFn,
  drawWithMaskFragment,
  generateMaskFromOutput,
  prepareModelInput,
} from './shaders.ts';

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
const device = await adapter?.requestDevice({
  label: `my device ${performance.now()}`,
}) as GPUDevice;
if (!device || !adapter) {
  throw new Error('Failed to initialize device.');
}

// monkey patching ONNX (setting device in the environment does nothing)
const oldRequestAdapter = navigator.gpu.requestAdapter;
const oldRequestDevice = adapter.requestDevice;
navigator.gpu.requestAdapter = async () => adapter;
adapter.requestDevice = async () => device;
const root = await tgpu.initFromDevice({ device });
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// resources

let iterations = 10;

const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const maskTexture = root['~unstable'].createTexture({
  size: [MODEL_WIDTH, MODEL_HEIGHT],
  format: 'rgba8unorm',
  dimension: '2d',
}).$usage('sampled', 'render', 'storage');

const modelInputBuffer = root
  .createBuffer(d.arrayOf(d.f32, 3 * MODEL_WIDTH * MODEL_HEIGHT))
  .$usage('storage');

const modelOutputBuffer = root
  .createBuffer(d.arrayOf(d.f32, 1 * MODEL_WIDTH * MODEL_HEIGHT))
  .$usage('storage');

let blurredTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba8unorm';
  }>
  & SampledFlag
  & RenderFlag
  & StorageFlag
)[];

let blurBindGroups: TgpuBindGroup<(typeof blurLayout)['entries']>[];

const zeroBuffer = root.createBuffer(d.u32, 0).$usage('uniform');
const oneBuffer = root.createBuffer(d.u32, 1).$usage('uniform');

// pipelines

const prepareModelInputPipeline = root['~unstable'].prepareDispatch(
  prepareModelInput,
);

const { run: runSession, release: releaseSession } = await prepareSession(
  root.unwrap(modelInputBuffer),
  root.unwrap(modelOutputBuffer),
);

const generateMaskFromOutputPipeline = root['~unstable'].prepareDispatch(
  generateMaskFromOutput,
);

const blurPipeline = root['~unstable']
  .withCompute(computeFn)
  .createPipeline();

const drawWithMaskPipeline = root['~unstable']
  .withVertex(fullScreenTriangle, {})
  .withFragment(drawWithMaskFragment, { format: presentationFormat })
  .createPipeline();

// recalculating mask

let calculateMaskCallbackId: number | undefined;

async function processCalculateMask() {
  if (video.readyState < 2) {
    calculateMaskCallbackId = video.requestVideoFrameCallback(
      processCalculateMask,
    );
    return;
  }

  prepareModelInputPipeline
    .with(root.createBindGroup(prepareModelInputLayout, {
      inputTexture: device.importExternalTexture({ source: video }),
      outputBuffer: modelInputBuffer,
      sampler,
    }))
    .dispatchThreads(MODEL_WIDTH, MODEL_HEIGHT);

  root['~unstable'].flush();

  await runSession();

  generateMaskFromOutputPipeline
    .with(root.createBindGroup(generateMaskLayout, {
      maskTexture: maskTexture,
      outputBuffer: modelOutputBuffer,
    }))
    .dispatchThreads(MODEL_WIDTH, MODEL_HEIGHT);

  calculateMaskCallbackId = video.requestVideoFrameCallback(
    processCalculateMask,
  );
}
calculateMaskCallbackId = video.requestVideoFrameCallback(processCalculateMask);

// frame

function onVideoChange(size: { width: number; height: number }) {
  const aspectRatio = size.width / size.height;
  video.style.height = `${video.clientWidth / aspectRatio}px`;
  if (canvas.parentElement) {
    canvas.parentElement.style.aspectRatio = `${aspectRatio}`;
    canvas.parentElement.style.height =
      `min(100cqh, calc(100cqw/(${aspectRatio})))`;
  }
  blurredTextures = [0, 1].map(() =>
    root['~unstable'].createTexture({
      size: [size.width, size.height],
      format: 'rgba8unorm',
      dimension: '2d',
    }).$usage('sampled', 'render', 'storage')
  );
  blurBindGroups = [
    root.createBindGroup(blurLayout, {
      flip: zeroBuffer,
      inTexture: blurredTextures[0],
      outTexture: blurredTextures[1],
      sampler,
    }),
    root.createBindGroup(blurLayout, {
      flip: oneBuffer,
      inTexture: blurredTextures[1],
      outTexture: blurredTextures[0],
      sampler,
    }),
  ];
}

let videoFrameCallbackId: number | undefined;
let frameSize: { width: number; height: number } | undefined;

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

  if (!frameSize) {
    frameSize = { width: frameWidth, height: frameHeight };
    onVideoChange(frameSize);
  }

  blurredTextures[0].write(video);

  for (const _ of Array(iterations)) {
    blurPipeline
      .with(blurBindGroups[0])
      .dispatchWorkgroups(
        Math.ceil(frameWidth / blockDim),
        Math.ceil(frameHeight / 4),
      );
    blurPipeline
      .with(blurBindGroups[1])
      .dispatchWorkgroups(
        Math.ceil(frameHeight / blockDim),
        Math.ceil(frameWidth / 4),
      );
  }

  drawWithMaskPipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      clearValue: [1, 1, 1, 1],
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(root.createBindGroup(drawWithMaskLayout, {
      inputTexture: device.importExternalTexture({ source: video }),
      inputBlurredTexture: blurredTextures[0],
      maskTexture: maskTexture,
      sampler,
    }))
    .draw(3);

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}
videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);

// #region Example controls & Cleanup

export const controls = {
  'blur strength': {
    initial: 10,
    min: 0,
    max: 20,
    step: 1,
    onSliderChange(newValue: number) {
      iterations = newValue;
    },
  },
};

export function onCleanup() {
  if (videoFrameCallbackId !== undefined) {
    video.cancelVideoFrameCallback(videoFrameCallbackId);
  }
  if (calculateMaskCallbackId !== undefined) {
    video.cancelVideoFrameCallback(calculateMaskCallbackId);
  }
  releaseSession();
  if (video.srcObject) {
    for (const track of (video.srcObject as MediaStream).getTracks()) {
      track.stop();
    }
  }
  navigator.gpu.requestAdapter = oldRequestAdapter;
  if (adapter) {
    adapter.requestDevice = oldRequestDevice;
  }

  root.destroy();
}

// #endregion
