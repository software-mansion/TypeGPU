import tgpu, {
  type RenderFlag,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuTexture,
} from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import { MODEL_HEIGHT, MODEL_WIDTH, MODELS, prepareSession } from './model.ts';
import {
  blockDim,
  blurLayout,
  drawWithMaskLayout,
  flipSlot,
  generateMaskLayout,
  Params,
  paramsAccessor,
  prepareModelInputLayout,
} from './schemas.ts';
import {
  computeFn,
  drawWithMaskFragment,
  generateMaskFromOutput,
  prepareModelInput,
} from './shaders.ts';

// Background segmentation uses the u2netp model (https://github.com/xuebinqin/U-2-Net)
// by Xuebin Qin et al., licensed under the Apache License 2.0 (https://www.apache.org/licenses/LICENSE-2.0)

// We need to wait for issue to close and release: https://github.com/microsoft/onnxruntime/issues/26480
if (/^((?!chrome|android).)*safari/i.test(navigator.userAgent)) {
  throw new Error('Unfortunately, ONNX does not work on Safari or iOS yet.');
}

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
const device = await adapter?.requestDevice() as GPUDevice;

if (!device || !adapter) {
  throw new Error('Failed to initialize device.');
}

// monkey patching ONNX: https://github.com/microsoft/onnxruntime/issues/26107
const oldRequestAdapter = navigator.gpu.requestAdapter;
const oldRequestDevice = adapter.requestDevice;
navigator.gpu.requestAdapter = async () => adapter;
adapter.requestDevice = async () => device;
const root = tgpu.initFromDevice({ device });
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
let useSquareCrop = false;

const paramsUniform = root.createUniform(Params, {
  cropBounds: d.vec4f(0, 0, 1, 1),
  useGaussian: 0,
  sampleBias: blurStrength,
});

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

let blurredTextures: (
  & TgpuTexture<{
    size: [number, number];
    format: 'rgba8unorm';
    mipLevelCount: 10;
  }>
  & StorageFlag
  & SampledFlag
  & RenderFlag
)[];

const generateMaskBindGroup = root.createBindGroup(generateMaskLayout, {
  maskTexture,
  outputBuffer: modelOutputBuffer,
});

let blurBindGroups: TgpuBindGroup<typeof blurLayout.entries>[];

// pipelines

const prepareModelInputPipeline = root['~unstable']
  .with(paramsAccessor, paramsUniform)
  .createGuardedComputePipeline(
    prepareModelInput,
  );

let currentModelIndex = 0;
let session = await prepareSession(
  root.unwrap(modelInputBuffer),
  root.unwrap(modelOutputBuffer),
  MODELS[currentModelIndex],
);
let isLoadingModel = false;

async function switchModel(modelIndex: number) {
  if (isLoadingModel || modelIndex === currentModelIndex) return;
  isLoadingModel = true;

  const oldSession = session;
  currentModelIndex = modelIndex;
  session = await prepareSession(
    root.unwrap(modelInputBuffer),
    root.unwrap(modelOutputBuffer),
    MODELS[currentModelIndex],
  );
  oldSession.release();
  isLoadingModel = false;
}

const generateMaskFromOutputPipeline = root['~unstable']
  .createGuardedComputePipeline(
    generateMaskFromOutput,
  );

const blurPipelines = [false, true].map((flip) =>
  root['~unstable']
    .with(flipSlot, flip)
    .withCompute(computeFn)
    .createPipeline()
);

const drawWithMaskPipeline = root['~unstable']
  .with(paramsAccessor, paramsUniform)
  .withVertex(fullScreenTriangle, {})
  .withFragment(drawWithMaskFragment, { format: presentationFormat })
  .createPipeline();

// recalculating mask

let calculateMaskCallbackId: number | undefined;

async function processCalculateMask() {
  if (video.readyState < 2 || isLoadingModel) {
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

  await session.run();

  generateMaskFromOutputPipeline
    .with(generateMaskBindGroup)
    .dispatchThreads(MODEL_WIDTH, MODEL_HEIGHT);

  calculateMaskCallbackId = video.requestVideoFrameCallback(
    processCalculateMask,
  );
}
calculateMaskCallbackId = video.requestVideoFrameCallback(processCalculateMask);

// frame
function updateCropBounds(aspectRatio: number) {
  let uvMinX = 0;
  let uvMinY = 0;
  let uvMaxX = 1;
  let uvMaxY = 1;

  if (useSquareCrop) {
    if (aspectRatio > 1) {
      // wide (e.g. 16:9) - crop horizontally
      const cropWidth = 1 / aspectRatio; // width of square in UV space
      uvMinX = (1 - cropWidth) / 2;
      uvMaxX = uvMinX + cropWidth;
    } else if (aspectRatio < 1) {
      // tall - crop vertically
      const cropHeight = aspectRatio; // height of square in UV space
      uvMinY = (1 - cropHeight) / 2;
      uvMaxY = uvMinY + cropHeight;
    }
  }
  paramsUniform.writePartial({
    cropBounds: d.vec4f(uvMinX, uvMinY, uvMaxX, uvMaxY),
  });
}

function onVideoChange(size: { width: number; height: number }) {
  const aspectRatio = size.width / size.height;
  video.style.height = `${video.clientWidth / aspectRatio}px`;
  if (canvas.parentElement) {
    canvas.parentElement.style.aspectRatio = `${aspectRatio}`;
    canvas.parentElement.style.height =
      `min(100cqh, calc(100cqw/(${aspectRatio})))`;
  }

  updateCropBounds(aspectRatio);

  blurredTextures = [0, 1].map(() =>
    root['~unstable'].createTexture({
      size: [size.width, size.height],
      format: 'rgba8unorm',
      mipLevelCount: 10,
    }).$usage('sampled', 'render', 'storage')
  );
  blurBindGroups = [
    root.createBindGroup(blurLayout, {
      inTexture: blurredTextures[0],
      outTexture: blurredTextures[1].createView(
        d.textureStorage2d('rgba8unorm', 'read-only'),
        { mipLevelCount: 1 },
      ),
      sampler,
    }),
    root.createBindGroup(blurLayout, {
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

  blurredTextures[0].write(video);

  if (useGaussianBlur) {
    for (const _ of Array(blurStrength * 2)) {
      blurPipelines[0]
        .with(blurBindGroups[0])
        .dispatchWorkgroups(
          Math.ceil(frameWidth / blockDim),
          Math.ceil(frameHeight / 4),
        );
      blurPipelines[1]
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

// #region Example controls & Cleanup

export const controls = {
  model: {
    initial: MODELS[0].name,
    options: MODELS.map((m) => m.name),
    async onSelectChange(value: string) {
      const index = MODELS.findIndex((m) => m.name === value);
      if (index !== -1) {
        await switchModel(index);
      }
    },
  },
  'blur type': {
    initial: 'mipmaps',
    options: ['mipmaps', 'gaussian'],
    async onSelectChange(value: string) {
      useGaussianBlur = value === 'gaussian';
      paramsUniform.writePartial({ useGaussian: useGaussianBlur ? 1 : 0 });
    },
  },
  'blur strength': {
    initial: blurStrength,
    min: 0,
    max: 10,
    step: 1,
    onSliderChange(newValue: number) {
      blurStrength = newValue;
      paramsUniform.writePartial({ sampleBias: blurStrength });
    },
  },
  'square crop': {
    initial: useSquareCrop,
    onToggleChange(value: boolean) {
      useSquareCrop = value;
      if (lastFrameSize) {
        updateCropBounds(lastFrameSize.width / lastFrameSize.height);
      }
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
