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
const MODEL_HOST = 'https://huggingface.co/reczkok/depthart-typegpu/resolve/main';
type ModelLabel = keyof typeof MODEL_BUNDLES;
const MODEL_LABELS = Object.keys(MODEL_BUNDLES) as ModelLabel[];
const DEFAULT_MODEL: ModelLabel = 'base · 24 MB';
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

/**
 * A press starts as `press` and only becomes a `drag` once it clears the tap
 * slop, so a release still holding `press` is a tap. A second pointer promotes
 * the whole gesture to `pinch`, which stays latched until every pointer lifts.
 */
type Gesture =
  | { readonly kind: 'none' }
  | { readonly kind: 'press'; readonly grabbed: boolean; readonly x: number; readonly y: number }
  | { readonly kind: 'drag' }
  | { readonly kind: 'pinch'; span: number };

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const video = document.querySelector('video') as HTMLVideoElement;
const status = document.querySelector('.status') as HTMLDivElement;
const listenerController = new AbortController();

let root: TgpuRoot | undefined;
let plan: DepthInferencePlan | undefined;
let renderer: DepthRelightingRenderer | undefined;
let disposed = false;
let deviceLost = false;
/** Holds off new frames while a bundle swap tears down the running renderer */
let swapping = false;
let inFlightFrame: Promise<unknown> | undefined;

const pointers = new Map<number, { x: number; y: number }>();
let gesture: Gesture = { kind: 'none' };
let control: LightControl = LightControl.ORBIT;
let lightPosition: [number, number] = [...defaultRelightingSettings.lightPosition];
let lightZ = defaultRelightingSettings.lightZ;

const camera = new DepthCameraSession(
  video,
  {
    onFrame: async (frame) => {
      const activeRenderer = renderer;
      if (!activeRenderer || disposed || deviceLost || swapping) {
        return;
      }
      if (control === LightControl.ORBIT) {
        const phase = performance.now() * ORBIT_SPEED;
        placeLight(
          0.5 + Math.cos(phase) * ORBIT_RADIUS,
          0.44 + Math.sin(phase * 1.37) * ORBIT_RADIUS * 0.8,
        );
      }
      const pending = activeRenderer.render(frame);
      inFlightFrame = pending;
      await pending;
      if (!status.hidden) {
        status.hidden = true;
      }
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

/** Restarts capture on the other lens and mirrors only the front one */
async function setFacing(facing: (typeof FACING_MODES)[number]): Promise<void> {
  camera.facingMode = facing === 'front' ? 'user' : 'environment';
  renderer?.update({ mirror: facing === 'front' });
  if (!camera.active) {
    return;
  }
  await camera.stop();
  try {
    await camera.start();
    renderer?.resetHistory();
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
  status.textContent = message;
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

/**
 * Captures the pointer so a drag keeps steering after it leaves the canvas. A
 * touch does not steer until it moves, so the first finger of a pinch cannot
 * throw the light across the frame before the second one lands.
 *
 * Pressing away from the bulb places the light and pins it. Pressing on the bulb
 * grabs it instead, so a drag carries it and a tap without movement releases it
 * back to the orbit. That reads the same under a mouse and under a finger, and it
 * leaves the two-finger pinch free to keep pushing the light in depth.
 */
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
  if (!grabbed) {
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
  if (gesture.kind === 'press') {
    if (Math.hypot(point.x - gesture.x, point.y - gesture.y) > TAP_SLOP) {
      gesture = { kind: 'drag' };
      pinLight(true);
    }
    placeLight(point.x, point.y);
    return;
  }
  if (gesture.kind === 'drag') {
    placeLight(point.x, point.y);
    return;
  }

  canvas.style.cursor = overLight(point) ? 'grab' : 'crosshair';
  if (control === LightControl.CURSOR) {
    placeLight(point.x, point.y);
  }
}

/**
 * A pinch stays latched until every finger lifts. Releasing one of two otherwise
 * hands the light to whichever finger is left, snapping it across the frame.
 */
function endGesture(event: PointerEvent): void {
  pointers.delete(event.pointerId);
  if (gesture.kind === 'pinch') {
    gesture.span = pinchSpan();
  }
  if (pointers.size > 0) {
    return;
  }
  if (gesture.kind === 'press' && gesture.grabbed) {
    pinLight(control !== LightControl.PINNED);
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

/**
 * Builds a plan and renderer from bundle bytes and swaps them in, replacing any
 * model already running. The old pair is torn down only once the new one has
 * compiled, so a bundle that fails to load leaves the running model untouched.
 */
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
    await inFlightFrame?.catch(() => undefined);
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
  } finally {
    swapping = false;
  }
}

async function loadModel(label: ModelLabel): Promise<void> {
  const url = `${MODEL_HOST}/${MODEL_BUNDLES[label]}.depthart`;
  try {
    setStatus('busy', `Downloading ${label}…`);
    const response = await fetch(url, { signal: listenerController.signal });
    if (!response.ok) {
      throw new Error(`Model download failed (${response.status}).`);
    }
    await attachBundle(await response.arrayBuffer());
  } catch (error) {
    if (!disposed) {
      setStatus('error', `Could not load ${label}: ${errorMessage(error)}`);
    }
  }
}

async function initialize(): Promise<void> {
  setStatus('busy', 'Initializing WebGPU…');
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
      void camera.stop();
      setStatus('error', `GPU device lost: ${info.message || info.reason}`);
    });

    await loadModel(DEFAULT_MODEL);
    if (disposed || deviceLost || root !== nextRoot || !renderer) {
      return;
    }

    setStatus('busy', 'Waiting for the camera…');
    await camera.start();
    renderer?.resetHistory();
  } catch (error) {
    if (!disposed) {
      setStatus('error', `Could not start: ${errorMessage(error)}`);
    }
  }
}

void initialize();

// #region Example controls & Cleanup

export const controls = defineControls({
  model: {
    initial: DEFAULT_MODEL,
    options: MODEL_LABELS,
    onSelectChange: (label: ModelLabel) => void loadModel(label),
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
  listenerController.abort();
  void camera.destroy().finally(() => {
    renderer?.destroy();
    plan?.destroy();
    root?.destroy();
  });
}

// #endregion
