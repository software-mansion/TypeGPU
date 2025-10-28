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
  sampleBiasSlot,
  useGaussianSlot,
  uvTransformSlot,
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
const attributionPopup = document.getElementById(
  'attribution',
) as HTMLDivElement;

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

let blurStrength = 5;
let useGaussianBlur = false;

const sampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
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

// AAA try to do this immediately
let blurredTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba8unorm';
  }>
  & SampledFlag
  & RenderFlag
  & StorageFlag
)[];

// AAA this as well
let blurBindGroups: TgpuBindGroup<(typeof blurLayout)['entries']>[];
// AAA and other bind groups

const zeroBuffer = root.createBuffer(d.u32, 0).$usage('uniform');
const oneBuffer = root.createBuffer(d.u32, 1).$usage('uniform');

const uvTransformUniform = root.createUniform(d.mat2x2f, d.mat2x2f.identity());
const useGaussianUniform = root.createUniform(d.u32, 0);
const sampleBiasUniform = root.createUniform(d.f32, 0);

// pipelines

const prepareModelInputPipeline = root['~unstable'].prepareDispatch(
  prepareModelInput,
);

const session = await prepareSession(
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
  .with(useGaussianSlot, useGaussianUniform)
  .with(sampleBiasSlot, sampleBiasUniform)
  .with(uvTransformSlot, uvTransformUniform)
  .withVertex(fullScreenTriangle, {})
  .withFragment(drawWithMaskFragment, { format: presentationFormat })
  .createPipeline();

// iOS

if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
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

  setUVTransformForIOS();
  window.addEventListener('orientationchange', setUVTransformForIOS);
}

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

  await session.run();

  generateMaskFromOutputPipeline
    .with(root.createBindGroup(generateMaskLayout, {
      maskTexture,
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
      mipLevelCount: 10,
    }).$usage('sampled', 'render', 'storage')
  );
  blurBindGroups = [
    root.createBindGroup(blurLayout, {
      flip: zeroBuffer,
      inTexture: blurredTextures[0],
      outTexture: blurredTextures[1].createView(
        d.textureStorage2d('rgba8unorm', 'read-only'),
        { mipLevelCount: 1 },
      ),
      sampler,
    }),
    root.createBindGroup(blurLayout, {
      flip: oneBuffer,
      inTexture: blurredTextures[1],
      outTexture: blurredTextures[0].createView(
        d.textureStorage2d('rgba8unorm', 'read-only'),
        { mipLevelCount: 1 },
      ),
      sampler,
    }),
  ];
}

let videoFrameCallbackId: number | undefined;
let lastFrameSize: { width: number; height: number } | undefined;

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

  // AAA check na subgroupy zeby byl ladniejszy error
  blurredTextures[0].write(video);

  if (useGaussianBlur) {
    for (const _ of Array(blurStrength)) {
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
  } else {
    blurredTextures[0].generateMipmaps();
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
      maskTexture,
      sampler,
    }))
    .draw(3);

  videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
}
videoFrameCallbackId = video.requestVideoFrameCallback(processVideoFrame);
attributionPopup.style.opacity = '1';

// #region Example controls & Cleanup

export const controls = {
  'blur type': {
    initial: 'mipmaps',
    options: ['mipmaps', 'gaussian'],
    async onSelectChange(value: string) {
      useGaussianBlur = value === 'gaussian';
      useGaussianUniform.write(useGaussianBlur ? 1 : 0);
    },
  },
  'blur strength': {
    initial: blurStrength,
    min: 0,
    max: 10,
    step: 1,
    onSliderChange(newValue: number) {
      blurStrength = newValue;
      sampleBiasUniform.write(blurStrength);
    },
  },
};

const hideAttributionPopup = (e: Event) => {
  if (e.target instanceof HTMLElement && e.target.tagName !== 'A') {
    attributionPopup.style.opacity = '0';
  }
};

attributionPopup.addEventListener('mousedown', hideAttributionPopup);
attributionPopup.addEventListener('touchdown', hideAttributionPopup);

export function onCleanup() {
  if (videoFrameCallbackId !== undefined) {
    video.cancelVideoFrameCallback(videoFrameCallbackId);
  }
  if (calculateMaskCallbackId !== undefined) {
    video.cancelVideoFrameCallback(calculateMaskCallbackId);
  }
  session.release();
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
