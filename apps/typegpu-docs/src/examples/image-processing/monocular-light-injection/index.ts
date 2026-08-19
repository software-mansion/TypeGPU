import { d, tgpu } from 'typegpu';
import type { TgpuRoot } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { DepthCameraSession } from './camera-session.ts';
import {
  createDepthInference,
  parseDepthBundle,
  type DepthInferencePlan,
} from './inference/index.ts';
import {
  DepthRelightingRenderer,
  LIGHT_Z_MAX,
  LIGHT_Z_MIN,
  defaultRelightingSettings,
} from './renderer.ts';
import { RelightMode } from './shaders.ts';

/** Bundles keyed by the label the model select shows, sized so no download surprises */
const MODEL_BUNDLES = {
  'small · 13 MB': 'depthart-relative-s-448-balanced',
  'base · 24 MB': 'depthart-relative-b-448-balanced',
  'large · 68 MB': 'depthart-relative-l-448-balanced',
  'small, no fp16 · 23 MB': 'depthart-relative-s-448-f32',
  'base, no fp16 · 43 MB': 'depthart-relative-b-448-f32',
} as const;
/** Pinned revision so deployed docs keep downloading byte-identical bundles */
const MODEL_HOST =
  'https://huggingface.co/reczkok/depthart-typegpu/resolve/913a7c13ddfbd48549279555d1db98172e8e5e0d';
const MODEL_CACHE = 'depthart-models';
const DEMO_IMAGE_URL = '/TypeGPU/assets/depthart/demo.jpg';
type ModelLabel = keyof typeof MODEL_BUNDLES;
const MODEL_LABELS = Object.keys(MODEL_BUNDLES) as ModelLabel[];
const RECOMMENDED_MODEL: ModelLabel = 'small · 13 MB';

const SourceChoice = {
  CAMERA: 'camera',
  DEMO: 'demo',
  UPLOAD: 'upload',
} as const;
type SourceChoice = (typeof SourceChoice)[keyof typeof SourceChoice];
/** Ordered to match RelightMode, so a view's index is the mode it selects */
const VIEW_MODES = ['relit', 'camera', 'depth', 'normals'] as const;
const FACING_MODES = ['front', 'back'] as const;
const ORBIT_SPEED = 0.00024;
const ORBIT_RADIUS = 0.26;
const CAMERA_FRAME_RATE = 60;
const WHEEL_STEP_LIMIT = 60;
const WHEEL_SENSITIVITY = 0.0015;
const PINCH_SENSITIVITY = 0.004;
/** How close to the bulb a press counts as grabbing it rather than placing it */
const LIGHT_GRAB_RADIUS = 0.08;
/** Movement past which a press is a drag rather than a tap, in canvas fractions */
const TAP_SLOP = 0.012;

/** Where the light's position comes from between frames */
const LightControl = {
  ORBIT: 'orbit',
  CURSOR: 'cursor',
  PINNED: 'pinned',
} as const;
type LightControl = (typeof LightControl)[keyof typeof LightControl];

/** A press becomes a `drag` once it clears the tap slop; a release still holding `press` is a tap */
type Gesture =
  | { readonly kind: 'none' }
  | { readonly kind: 'press'; readonly grabbed: boolean; readonly x: number; readonly y: number }
  | { readonly kind: 'drag' }
  | { readonly kind: 'pinch'; span: number };

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const video = document.querySelector('video') as HTMLVideoElement;
const status = document.querySelector('.status') as HTMLDivElement;
const statusMessage = document.querySelector('.status-message') as HTMLParagraphElement;
const chooser = document.querySelector('.chooser') as HTMLDivElement;
const sourceRow = document.querySelector('.source-row') as HTMLDivElement;
const modelRow = document.querySelector('.model-row') as HTMLDivElement;
const chooserError = document.querySelector('.chooser-error') as HTMLParagraphElement;
const photoInput = document.querySelector('.photo-input') as HTMLInputElement;
const listenerController = new AbortController();

let root: TgpuRoot | undefined;
let plan: DepthInferencePlan | undefined;
let renderer: DepthRelightingRenderer | undefined;
let disposed = false;
let deviceLost = false;
/** Holds off new frames while a bundle swap tears down the running renderer */
let swapping = false;
let modelLoads = 0;
let currentModel: ModelLabel | undefined;
let sourceChoice: SourceChoice = SourceChoice.CAMERA;
let uploadedImage: ImageBitmap | undefined;
let demoImage: ImageBitmap | undefined;
let staticLoopGeneration = 0;
/** Forces one full inference pass on the next static frame */
let depthDirty = true;

const pointers = new Map<number, { x: number; y: number }>();
let gesture: Gesture = { kind: 'none' };
let control: LightControl = LightControl.ORBIT;
let lightPosition: [number, number] = [...defaultRelightingSettings.lightPosition];
let lightZ = defaultRelightingSettings.lightZ;

function updateOrbitLight(): void {
  if (control !== LightControl.ORBIT) {
    return;
  }
  const phase = performance.now() * ORBIT_SPEED;
  placeLight(
    0.5 + Math.cos(phase) * ORBIT_RADIUS,
    0.44 + Math.sin(phase * 1.37) * ORBIT_RADIUS * 0.8,
  );
}

function clearTransientStatus(): void {
  if (modelLoads === 0 && status.dataset.tone === 'busy') {
    status.hidden = true;
  }
}

const camera = new DepthCameraSession(
  video,
  {
    onFrame: (frame) => {
      const activeRenderer = renderer;
      if (!activeRenderer || disposed || deviceLost || swapping) {
        return;
      }
      updateOrbitLight();
      activeRenderer.render(frame);
      clearTransientStatus();
    },
    onError: (error) => {
      if (!disposed && !deviceLost) {
        setStatus('error', `Camera stopped: ${errorMessage(error)}`);
      }
    },
    onEnded: () => {
      if (!disposed && !deviceLost) {
        setStatus('error', 'The camera stream ended.');
      }
    },
  },
  { frameRate: CAMERA_FRAME_RATE, facingMode: 'user' },
);

function stopStaticLoop(): void {
  staticLoopGeneration += 1;
}

/** Renders a still image at animation rate, running inference only while the depth is dirty */
function startStaticLoop(bitmap: ImageBitmap): void {
  const generation = ++staticLoopGeneration;
  depthDirty = true;
  const step = (): void => {
    if (generation !== staticLoopGeneration || disposed || deviceLost) {
      return;
    }
    const activeRenderer = renderer;
    if (activeRenderer && !swapping) {
      updateOrbitLight();
      const source = new VideoFrame(bitmap, { timestamp: performance.now() * 1000 });
      try {
        activeRenderer.render(
          {
            source,
            sourceWidth: bitmap.width,
            sourceHeight: bitmap.height,
            uvTransform: d.mat2x2f.identity(),
            swapAxes: false,
          },
          { skipDepth: !depthDirty },
        );
        depthDirty = false;
        clearTransientStatus();
      } catch (error) {
        if (generation === staticLoopGeneration && !disposed && !deviceLost) {
          setStatus('error', `Rendering stopped: ${errorMessage(error)}`);
        }
        return;
      } finally {
        source.close();
      }
    }
    if (generation === staticLoopGeneration) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

/** Restarts capture on the other lens and mirrors only the front one */
async function setFacing(facing: (typeof FACING_MODES)[number]): Promise<void> {
  camera.facingMode = facing === 'front' ? 'user' : 'environment';
  if (sourceChoice !== SourceChoice.CAMERA) {
    return;
  }
  renderer?.update({ mirror: facing === 'front' });
  if (!camera.active) {
    return;
  }
  await camera.stop();
  try {
    await camera.start();
    renderer?.resetHistory();
    depthDirty = true;
  } catch (error) {
    setStatus('error', `Could not switch camera: ${errorMessage(error)}`);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function setStatus(tone: 'busy' | 'error', message: string): void {
  status.dataset.tone = tone;
  status.hidden = false;
  statusMessage.textContent = message;
}

function placeLight(x: number, y: number): void {
  lightPosition = [clamp(x, 0, 1), clamp(y, 0, 1)];
  renderer?.update({ lightPosition });
}

/** Scrolls the light along the view axis, from far in front down to the subject */
function pushLight(amount: number): void {
  lightZ = clamp(lightZ + amount, LIGHT_Z_MIN, LIGHT_Z_MAX);
  renderer?.update({ lightZ });
}

/** Pinning holds the light still; releasing hands it back to the idle orbit */
function pinLight(pinned: boolean): void {
  control = pinned ? LightControl.PINNED : LightControl.CURSOR;
}

function canvasFraction(event: PointerEvent): { x: number; y: number } | undefined {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return undefined;
  }
  return {
    x: (event.clientX - rect.left) / rect.width,
    y: (event.clientY - rect.top) / rect.height,
  };
}

function overLight(point: { x: number; y: number }): boolean {
  return Math.hypot(point.x - lightPosition[0], point.y - lightPosition[1]) <= LIGHT_GRAB_RADIUS;
}

/** Distance between the first two held pointers, or zero when fewer are down */
function pinchSpan(): number {
  const [first, second] = [...pointers.values()];
  if (!first || !second) {
    return 0;
  }
  return Math.hypot(first.x - second.x, first.y - second.y);
}

/** A touch defers placement to the drag or the release, so a pinch's first finger cannot fling the light */
function beginGesture(event: PointerEvent): void {
  canvas.setPointerCapture(event.pointerId);
  pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pointers.size >= 2) {
    gesture = { kind: 'pinch', span: pinchSpan() };
    return;
  }
  const point = canvasFraction(event);
  if (!point) {
    return;
  }
  const grabbed = overLight(point);
  gesture = { kind: 'press', grabbed, x: point.x, y: point.y };
  if (!grabbed && event.pointerType !== 'touch') {
    placeLight(point.x, point.y);
    pinLight(true);
  }
}

/** Two fingers push the light along the view axis; one steers it across the frame */
function continueGesture(event: PointerEvent): void {
  if (pointers.has(event.pointerId)) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  }
  if (gesture.kind === 'pinch') {
    const span = pinchSpan();
    if (gesture.span > 0) {
      pushLight((span - gesture.span) * PINCH_SENSITIVITY);
    }
    gesture.span = span;
    return;
  }

  const point = canvasFraction(event);
  if (!point) {
    return;
  }
  switch (gesture.kind) {
    case 'press':
      if (Math.hypot(point.x - gesture.x, point.y - gesture.y) > TAP_SLOP) {
        gesture = { kind: 'drag' };
        pinLight(true);
        placeLight(point.x, point.y);
      }
      break;
    case 'drag':
      placeLight(point.x, point.y);
      break;
    case 'none':
      canvas.style.cursor = overLight(point) ? 'grab' : 'crosshair';
      if (control === LightControl.CURSOR) {
        placeLight(point.x, point.y);
      }
      break;
  }
}

/** A tap on the bulb releases it back to the orbit; a touch tap elsewhere places the light. A pinch stays latched until every finger lifts */
function endGesture(event: PointerEvent): void {
  pointers.delete(event.pointerId);
  if (gesture.kind === 'pinch') {
    gesture.span = pinchSpan();
  }
  if (pointers.size > 0) {
    return;
  }
  if (gesture.kind === 'press' && event.type === 'pointerup') {
    if (gesture.grabbed) {
      pinLight(control !== LightControl.PINNED);
    } else if (event.pointerType === 'touch') {
      placeLight(gesture.x, gesture.y);
      pinLight(true);
    }
  }
  gesture = { kind: 'none' };
}

function enterCanvas(): void {
  if (control !== LightControl.PINNED) {
    control = LightControl.CURSOR;
  }
}

function leaveCanvas(): void {
  if (control !== LightControl.PINNED) {
    control = LightControl.ORBIT;
  }
  canvas.style.cursor = 'crosshair';
}

function pushLightFromWheel(event: WheelEvent): void {
  event.preventDefault();
  let delta = event.deltaY;
  if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    delta *= 16;
  } else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    delta *= canvas.clientHeight;
  }
  delta = Math.sign(delta) * Math.min(Math.abs(delta), WHEEL_STEP_LIMIT);
  pushLight(delta * WHEEL_SENSITIVITY);
}

function onCanvas<K extends keyof HTMLElementEventMap>(
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): void {
  canvas.addEventListener(type, handler, { ...options, signal: listenerController.signal });
}

onCanvas('pointerdown', beginGesture);
onCanvas('pointermove', continueGesture);
onCanvas('pointerup', endGesture);
onCanvas('pointercancel', endGesture);
onCanvas('pointerenter', enterCanvas);
onCanvas('pointerleave', leaveCanvas);
onCanvas('wheel', pushLightFromWheel, { passive: false });

/** Builds a plan and renderer from bundle bytes and swaps them in */
async function attachBundle(bytes: ArrayBuffer): Promise<void> {
  const activeRoot = root;
  if (!activeRoot || disposed || deviceLost) {
    return;
  }
  const bundle = parseDepthBundle(bytes);
  setStatus('busy', `Compiling ${bundle.model} pipelines…`);
  swapping = true;
  try {
    const nextPlan = createDepthInference(activeRoot, bundle);
    try {
      await nextPlan.initAsync();
    } catch (error) {
      nextPlan.destroy();
      throw error;
    }
    if (disposed || deviceLost || root !== activeRoot) {
      nextPlan.destroy();
      return;
    }
    if (!renderer) {
      const nextRenderer = new DepthRelightingRenderer(activeRoot, canvas);
      await nextRenderer.initAsync();
      renderer = nextRenderer;
    }
    renderer.attach(nextPlan);
    plan?.destroy();
    plan = nextPlan;
    renderer.update({ lightPosition, lightZ });
    renderer.resetHistory();
    depthDirty = true;
  } finally {
    swapping = false;
  }
}

function modelUrl(label: ModelLabel): string {
  return `${MODEL_HOST}/${MODEL_BUNDLES[label]}.depthart`;
}

async function fetchModel(url: string): Promise<ArrayBuffer> {
  let cache: Cache | undefined;
  try {
    cache = await caches.open(MODEL_CACHE);
    const hit = await cache.match(url);
    if (hit) {
      return await hit.arrayBuffer();
    }
  } catch {
    cache = undefined;
  }
  const response = await fetch(url, { signal: listenerController.signal });
  if (!response.ok) {
    throw new Error(`Model download failed (${response.status}).`);
  }
  const bytes = await response.clone().arrayBuffer();
  await cache?.put(url, response).catch(() => undefined);
  return bytes;
}

async function isModelCached(label: ModelLabel): Promise<boolean> {
  try {
    const cache = await caches.open(MODEL_CACHE);
    return (await cache.match(modelUrl(label))) !== undefined;
  } catch {
    return false;
  }
}

async function loadModel(label: ModelLabel): Promise<boolean> {
  modelLoads += 1;
  try {
    setStatus('busy', `Downloading ${label}…`);
    await attachBundle(await fetchModel(modelUrl(label)));
    currentModel = label;
    return true;
  } catch (error) {
    if (!disposed) {
      setStatus('error', `Could not load ${label}: ${errorMessage(error)}`);
    }
    return false;
  } finally {
    modelLoads -= 1;
  }
}

async function loadDemoImage(): Promise<ImageBitmap> {
  if (!demoImage) {
    const response = await fetch(DEMO_IMAGE_URL, { signal: listenerController.signal });
    if (!response.ok) {
      throw new Error(`Demo photo download failed (${response.status}).`);
    }
    demoImage = await createImageBitmap(await response.blob());
  }
  return demoImage;
}

function markSelectedSource(): void {
  for (const button of sourceRow.querySelectorAll('button')) {
    button.classList.toggle('selected', button.dataset.choice === sourceChoice);
  }
}

function buildChooser(): void {
  const sources: [SourceChoice, string][] = [
    [SourceChoice.CAMERA, 'live camera'],
    [SourceChoice.DEMO, 'demo photo'],
    [SourceChoice.UPLOAD, 'your photo…'],
  ];
  for (const [choice, label] of sources) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.choice = choice;
    button.addEventListener(
      'click',
      () => {
        if (choice === SourceChoice.UPLOAD) {
          photoInput.click();
          return;
        }
        sourceChoice = choice;
        markSelectedSource();
      },
      { signal: listenerController.signal },
    );
    sourceRow.append(button);
  }
  photoInput.addEventListener(
    'change',
    () => {
      const file = photoInput.files?.[0];
      if (!file) {
        return;
      }
      void createImageBitmap(file).then((bitmap) => {
        uploadedImage?.close();
        uploadedImage = bitmap;
        sourceChoice = SourceChoice.UPLOAD;
        markSelectedSource();
      });
    },
    { signal: listenerController.signal },
  );

  for (const label of MODEL_LABELS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.dataset.model = label;
    if (label === RECOMMENDED_MODEL) {
      button.classList.add('recommended');
    }
    button.addEventListener('click', () => void startExperience(label), {
      signal: listenerController.signal,
    });
    modelRow.append(button);
  }
  markSelectedSource();
}

async function refreshCachedBadges(): Promise<void> {
  for (const button of modelRow.querySelectorAll('button')) {
    const label = button.dataset.model as ModelLabel;
    const cached = await isModelCached(label);
    let badge = button.querySelector('.cached-badge');
    if (cached && !badge) {
      badge = document.createElement('span');
      badge.className = 'cached-badge';
      badge.textContent = ' · cached';
      button.append(badge);
    }
  }
}

async function showChooser(errorText?: string): Promise<void> {
  stopStaticLoop();
  await camera.stop();
  status.hidden = true;
  chooserError.textContent = errorText ?? '';
  chooserError.hidden = !errorText;
  markSelectedSource();
  chooser.hidden = false;
  void refreshCachedBadges();
}

async function startSource(): Promise<void> {
  if (sourceChoice === SourceChoice.CAMERA) {
    setStatus('busy', 'Waiting for the camera…');
    renderer?.update({ mirror: camera.facingMode === 'user' });
    await camera.start();
    renderer?.resetHistory();
    depthDirty = true;
    return;
  }
  setStatus('busy', 'Preparing the photo…');
  const bitmap =
    sourceChoice === SourceChoice.UPLOAD && uploadedImage ? uploadedImage : await loadDemoImage();
  renderer?.update({ mirror: false });
  renderer?.resetHistory();
  startStaticLoop(bitmap);
}

async function startExperience(label: ModelLabel): Promise<void> {
  chooser.hidden = true;
  if (label !== currentModel || !plan) {
    const loaded = await loadModel(label);
    if (!loaded || disposed || deviceLost) {
      if (!disposed && !deviceLost) {
        await showChooser(statusMessage.textContent ?? 'Could not load the model.');
      }
      return;
    }
  }
  try {
    await startSource();
  } catch (error) {
    if (!disposed && !deviceLost) {
      await showChooser(`Could not start: ${errorMessage(error)}`);
    }
  }
}

async function initialize(): Promise<void> {
  setStatus('busy', 'Initializing WebGPU…');
  buildChooser();
  try {
    const nextRoot = await tgpu.init({
      device: { optionalFeatures: ['shader-f16'] },
    });
    if (disposed) {
      nextRoot.destroy();
      return;
    }
    root = nextRoot;
    void nextRoot.device.lost.then((info) => {
      if (disposed || root !== nextRoot) {
        return;
      }
      deviceLost = true;
      stopStaticLoop();
      void camera.stop();
      setStatus('error', `GPU device lost: ${info.message || info.reason}`);
    });
    await showChooser();
  } catch (error) {
    if (!disposed) {
      setStatus('error', `Could not start: ${errorMessage(error)}`);
    }
  }
}

void initialize();

// #region Example controls & Cleanup

export const controls = defineControls({
  'switch model / source': {
    onButtonClick: () => void showChooser(),
  },
  intensity: {
    initial: defaultRelightingSettings.intensity,
    min: 0,
    max: 3.5,
    step: 0.05,
    onSliderChange: (value: number) => renderer?.update({ intensity: value }),
  },
  relief: {
    initial: defaultRelightingSettings.relief,
    min: 0,
    max: 2.5,
    step: 0.05,
    onSliderChange: (value: number) => renderer?.update({ relief: value }),
  },
  shadow: {
    initial: defaultRelightingSettings.shadow,
    min: 0,
    max: 1,
    step: 0.05,
    onSliderChange: (value: number) => renderer?.update({ shadow: value }),
  },
  occlusion: {
    initial: defaultRelightingSettings.occlusion,
    min: 0,
    max: 1,
    step: 0.05,
    onSliderChange: (value: number) => renderer?.update({ occlusion: value }),
  },
  'light color': {
    initial: d.vec3f(...defaultRelightingSettings.lightColor),
    onColorChange: (value: d.v3f) => renderer?.update({ lightColor: [value.x, value.y, value.z] }),
  },
  view: {
    initial: VIEW_MODES[RelightMode.RELIT],
    options: VIEW_MODES,
    onSelectChange: (value: (typeof VIEW_MODES)[number]) =>
      renderer?.update({ mode: VIEW_MODES.indexOf(value) }),
  },
  camera: {
    initial: defaultRelightingSettings.mirror ? FACING_MODES[0] : FACING_MODES[1],
    options: FACING_MODES,
    onSelectChange: (value: (typeof FACING_MODES)[number]) => void setFacing(value),
  },
});

export function onCleanup(): void {
  if (disposed) {
    return;
  }
  disposed = true;
  stopStaticLoop();
  listenerController.abort();
  uploadedImage?.close();
  demoImage?.close();
  void camera.destroy().finally(() => {
    renderer?.destroy();
    plan?.destroy();
    root?.destroy();
  });
}

// #endregion
