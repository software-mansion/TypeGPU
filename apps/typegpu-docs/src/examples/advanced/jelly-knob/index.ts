import { tgpu, common, d, std } from 'typegpu';

import { PhoneMotion } from './motion.ts';
import { KnobBehavior } from './knob.ts';
import { CameraController } from './camera.ts';
import {
  cameraUniformSlot,
  darkModeUniformSlot,
  DirectionalLight,
  jellyColorUniformSlot,
  knobBehaviorSlot,
  lightUniformSlot,
  sampleLayout,
} from './dataTypes.ts';
import { createTextures } from './utils.ts';
import { TAAResolver } from './taa.ts';
import { CAMERA_POSITION, LIGHT_DIR, LIGHT_MODE_LIGHT_DIR } from './constants.ts';
import { raymarchFn } from './raymarchers.ts';
import { blue12 } from './blueNoise.ts';
import { defineControls } from '../../common/defineControls.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const root = await tgpu.init({
  device: {
    optionalFeatures: ['timestamp-query'],
  },
});
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const hasTimestampQuery = root.enabledFeatures.has('timestamp-query');

const knobBehavior = new KnobBehavior(root);
const phoneMotion = new PhoneMotion();
// Only show the button where a tap is actually required (iOS); other browsers start listening right away.
const showMotionButton =
  phoneMotion.needsPermission && window.matchMedia('(pointer: coarse)').matches;
knobBehavior.motionAcceleration = phoneMotion.acceleration;

// Auto quality works with a pixel budget rather than a fraction of the canvas, so that the cost
// of raymarching stays the same no matter how big the canvas gets (e.g. when going fullscreen
// on a high-DPI phone).
/** The budget used until the first Auto measurement finishes. */
const INITIAL_PIXEL_BUDGET = 512 * 512;
const MIN_AUTO_SCALE = 0.2;
/** How long to wait after the last resize before re-measuring the Auto quality. */
const AUTO_QUALITY_DEBOUNCE_MS = 300;

let qualityMode: 'auto' | 'manual' = 'auto';
let manualQualityScale = 0.5;
let autoPixelBudget = INITIAL_PIXEL_BUDGET;

function scaleForPixelBudget(pixelBudget: number) {
  const canvasPixels = canvas.width * canvas.height;
  return Math.max(MIN_AUTO_SCALE, Math.min(1, Math.sqrt(pixelBudget / canvasPixels)));
}

function getQualityScale() {
  return qualityMode === 'auto' ? scaleForPixelBudget(autoPixelBudget) : manualQualityScale;
}

function getRenderSize(scale: number): [number, number] {
  return [
    Math.max(1, Math.round(canvas.width * scale)),
    Math.max(1, Math.round(canvas.height * scale)),
  ];
}

let [width, height] = getRenderSize(getQualityScale());

let textures = createTextures(root, width, height);

const filteringSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const camera = new CameraController(
  root,
  CAMERA_POSITION,
  d.vec3f(0, 0, 0),
  d.vec3f(0, 1, 0),
  Math.PI / 4,
  width,
  height,
);
const cameraUniform = camera.cameraUniform;

const lightUniform = root.createUniform(DirectionalLight, {
  direction: LIGHT_MODE_LIGHT_DIR,
  color: d.vec3f(1, 1, 1),
});

const DEFAULT_JELLY_COLOR = d.vec3f(1, 0, 0.25);
const jellyColorUniform = root.createUniform(d.vec4f, d.vec4f(DEFAULT_JELLY_COLOR, 1));

const darkModeUniform = root.createUniform(d.u32, 0);

const fragmentMain = tgpu.fragmentFn({
  in: { uv: d.vec2f, position: d.builtin.position },
  out: d.vec4f,
})((input) => {
  'use gpu';
  const color = std.textureSample(sampleLayout.$.currentTexture, filteringSampler.$, input.uv);
  // Dither in display space after TAA and upscaling, before the canvas quantizes to 8 bits.
  // Evaluate per output pixel. Keep it fixed to avoid flicker,
  // and share the blue-noise value across RGB to avoid colored speckles.
  const threshold = blue12(std.floor(input.position.xy));
  const noise = ((threshold - 0.5) * 12) / 255;
  return d.vec4f(std.saturate(color.rgb + noise), color.a);
});

const rayMarchPipeline = root
  .with(knobBehaviorSlot, knobBehavior)
  .with(cameraUniformSlot, cameraUniform)
  .with(lightUniformSlot, lightUniform)
  .with(jellyColorUniformSlot, jellyColorUniform)
  .with(darkModeUniformSlot, darkModeUniform)
  .createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: raymarchFn,
    targets: { format: 'rgba16float' },
  });

const renderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: fragmentMain,
  targets: { format: presentationFormat },
});

let lastTimeStamp = performance.now();
let frameCount = 0;
const taaResolver = new TAAResolver(root, width, height);

function createRenderBindGroups() {
  return [0, 1].map((frame) =>
    root.createBindGroup(sampleLayout, {
      currentTexture: taaResolver.getResolvedTexture(frame),
    }),
  );
}

let renderBindGroups = createRenderBindGroups();

let animationFrameHandle: number;
function render(timestamp: number) {
  frameCount++;
  camera.jitter();
  const deltaTime = Math.min((timestamp - lastTimeStamp) * 0.001, 0.1);
  lastTimeStamp = timestamp;

  phoneMotion.update();
  knobBehavior.update(deltaTime);

  const currentFrame = frameCount % 2;

  rayMarchPipeline
    .withColorAttachment({
      view: textures[currentFrame].sampled,
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);

  taaResolver.resolve(textures[currentFrame].sampled, frameCount, currentFrame);

  renderPipeline
    .withColorAttachment({ view: context })
    .with(renderBindGroups[currentFrame])
    .draw(3);

  animationFrameHandle = requestAnimationFrame(render);
}

function destroyRenderTextures() {
  for (const { texture } of textures) {
    texture.destroy();
  }
}

function handleResize() {
  [width, height] = getRenderSize(getQualityScale());
  camera.updateProjection(Math.PI / 4, width, height);
  destroyRenderTextures();
  textures = createTextures(root, width, height);
  taaResolver.resize(width, height);
  frameCount = 0;

  renderBindGroups = createRenderBindGroups();
}

const autoResizer = common.attachAutoResizer({
  root,
  canvas,
  onResize() {
    // Applies the current pixel budget right away, then refines it for the new size.
    handleResize();
    if (qualityMode === 'auto') {
      scheduleAutoQuality();
    }
  },
});

animationFrameHandle = requestAnimationFrame(render);

// #region Example controls and cleanup

let prevX = 0;

canvas.addEventListener('touchstart', (event) => {
  knobBehavior.pressed = true;
  event.preventDefault();
  prevX = event.touches[0].clientX;
});

function handleTouchEnd() {
  knobBehavior.pressed = false;
}

canvas.addEventListener('touchend', handleTouchEnd);
canvas.addEventListener('touchcancel', handleTouchEnd);

canvas.addEventListener('touchmove', (event) => {
  if (!knobBehavior.pressed) return;
  event.preventDefault();
  const x = event.touches[0].clientX;
  knobBehavior.progress += ((x - prevX) / canvas.clientHeight) * 2;
  prevX = x;
});

canvas.addEventListener('mousedown', (event) => {
  knobBehavior.pressed = true;
  event.preventDefault();
  prevX = event.clientX;
});

canvas.addEventListener('mouseup', (event) => {
  knobBehavior.pressed = false;
  event.stopPropagation();
});

function handleMouseUp() {
  knobBehavior.pressed = false;
}

window.addEventListener('mouseup', handleMouseUp);

canvas.addEventListener('mousemove', (event) => {
  if (!knobBehavior.pressed) return;
  event.preventDefault();
  const x = event.clientX;
  knobBehavior.progress += ((x - prevX) / canvas.clientHeight) * 2;
  prevX = x;
});

let disposed = false;
// Incremented on every quality change, so late Auto benchmarks can tell they were superseded.
let qualityRequestId = 0;

let autoQualityTimeout: ReturnType<typeof setTimeout> | undefined;

/** Measures how many pixels can be raymarched within the target frame time. */
async function measurePixelBudget(isCancelled: () => boolean) {
  // About 60% of a 60 Hz frame, leaving the rest for TAA, the final blit and the browser.
  const targetFrameTime = 10;
  const tolerance = 1.5;
  // Start from the current budget, so re-measuring after a resize converges quickly.
  let resolutionScale = scaleForPixelBudget(autoPixelBudget);
  let [testWidth, testHeight] = getRenderSize(resolutionScale);

  // The performance callback fires asynchronously, after the query set has been read back,
  // which can be later than `onSubmittedWorkDone()` resolves. Each measurement waits for it.
  let resolveGpuTime: ((ms: number) => void) | undefined;
  const measurePipeline = hasTimestampQuery
    ? rayMarchPipeline.withPerformanceCallback((start, end) => {
        resolveGpuTime?.(Number(end - start) / 1e6);
      })
    : rayMarchPipeline;

  /** Draws the raymarch once at the given size, timing it with GPU timestamps and the wall clock. */
  async function timeDraw(drawWidth: number, drawHeight: number) {
    const testTexture = root
      .createTexture({
        size: [drawWidth, drawHeight],
        format: 'rgba16float',
      })
      .$usage('render');

    const gpuTimePromise = new Promise<number | undefined>((resolve) => {
      resolveGpuTime = resolve;
      if (!hasTimestampQuery) resolve(undefined);
      setTimeout(() => resolve(undefined), 500);
    });

    // Drain frames already in flight, so the wall clock only times the test draw.
    await root.device.queue.onSubmittedWorkDone();
    const wallStart = performance.now();
    measurePipeline
      .withColorAttachment({
        view: testTexture,
        loadOp: 'clear',
        storeOp: 'store',
      })
      .draw(3);
    await root.device.queue.onSubmittedWorkDone();
    const wallMs = performance.now() - wallStart;
    const gpuMs = await gpuTimePromise;
    resolveGpuTime = undefined;
    testTexture.destroy();
    return { wallMs, gpuMs };
  }

  // The wall clock also includes a fixed cost per submission (scheduling, the round trip of
  // `onSubmittedWorkDone()`). A 1x1 draw has next to no shading work, so its time is that cost.
  let wallOverheadMs = Number.POSITIVE_INFINITY;
  for (let i = 0; i < 3; i++) {
    if (isCancelled()) break;
    wallOverheadMs = Math.min(wallOverheadMs, (await timeDraw(1, 1)).wallMs);
  }

  for (let i = 0; i < 8; i++) {
    if (isCancelled()) break;

    [testWidth, testHeight] = getRenderSize(resolutionScale);
    // Taking the faster of two runs filters out one-off hiccups.
    const runA = await timeDraw(testWidth, testHeight);
    if (isCancelled()) break;
    const runB = await timeDraw(testWidth, testHeight);
    const gpuTimeMs =
      runA.gpuMs !== undefined && runB.gpuMs !== undefined
        ? Math.min(runA.gpuMs, runB.gpuMs)
        : undefined;
    const wallTimeMs = Math.max(0, Math.min(runA.wallMs, runB.wallMs) - wallOverheadMs);

    // Some implementations (e.g. Safari on iOS) quantize or zero out timestamps, which shows up
    // as an implausibly short pass. In that case, fall back to the wall clock.
    const usesGpuTime = gpuTimeMs !== undefined && gpuTimeMs > 0.1;
    const lastTimeMs = usesGpuTime ? gpuTimeMs : wallTimeMs;

    if (Math.abs(lastTimeMs - targetFrameTime) < tolerance) {
      break;
    }

    const adjustment = lastTimeMs > targetFrameTime ? -0.1 : 0.1;
    const nextScale = Math.max(MIN_AUTO_SCALE, Math.min(1.0, resolutionScale + adjustment));
    if (nextScale === resolutionScale) {
      break;
    }
    resolutionScale = nextScale;
  }

  console.log(
    `Auto-selected quality: ${testWidth}x${testHeight} (scale ${resolutionScale.toFixed(2)})`,
  );
  return testWidth * testHeight;
}

function runAutoQuality() {
  clearTimeout(autoQualityTimeout);
  const requestId = ++qualityRequestId;
  const isCancelled = () => disposed || requestId !== qualityRequestId;
  void measurePixelBudget(isCancelled).then((pixelBudget) => {
    if (isCancelled()) return;
    autoPixelBudget = pixelBudget;
    handleResize();
  });
}

/** Re-measures the Auto quality once the canvas stops resizing. */
function scheduleAutoQuality() {
  // Cancels any measurement made for the previous canvas size.
  ++qualityRequestId;
  clearTimeout(autoQualityTimeout);
  autoQualityTimeout = setTimeout(runAutoQuality, AUTO_QUALITY_DEBOUNCE_MS);
}

export const controls = defineControls({
  'Enable Phone Motion': showMotionButton && {
    onButtonClick: () => phoneMotion.enable(),
  },
  'Dark Mode': {
    initial: false,
    onToggleChange: (dark) => {
      darkModeUniform.write(d.u32(dark));
      lightUniform.patch({ direction: dark ? LIGHT_DIR : LIGHT_MODE_LIGHT_DIR });
      // Discard the previous lighting setup's TAA history without reallocating textures.
      frameCount = 0;
    },
  },
  Quality: {
    initial: 'Auto',
    options: ['Auto', 'Very Low', 'Low', 'Medium', 'High', 'Ultra'],
    onSelectChange: (value) => {
      if (value === 'Auto') {
        qualityMode = 'auto';
        handleResize();
        runAutoQuality();
        return;
      }

      qualityMode = 'manual';
      // Cancels any pending or in-flight Auto measurement.
      ++qualityRequestId;
      clearTimeout(autoQualityTimeout);

      const qualityMap: { [key: string]: number } = {
        'Very Low': 0.3,
        Low: 0.5,
        Medium: 0.7,
        High: 0.85,
        Ultra: 1.0,
      };

      manualQualityScale = qualityMap[value] || 0.5;
      handleResize();
    },
  },
  'Jelly Color': {
    initial: DEFAULT_JELLY_COLOR,
    onColorChange: (c) => {
      jellyColorUniform.write(d.vec4f(c, 1));
    },
  },
});

export function onCleanup() {
  disposed = true;
  clearTimeout(autoQualityTimeout);
  cancelAnimationFrame(animationFrameHandle);
  autoResizer.detach();
  phoneMotion.destroy();
  window.removeEventListener('mouseup', handleMouseUp);
  destroyRenderTextures();
  taaResolver.destroy();
  root.destroy();
}

// #endregion
