import { d, tgpu } from 'typegpu';
import type { TgpuRoot } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { DepthCameraSession } from './camera-session.ts';
import { SourceChoice, SourceChooser } from './chooser.ts';
import { parseDepthBundle } from '../../common/depthart-inference/bundle.ts';
import { DepthInferencePlan } from '../../common/depthart-inference/depthart.ts';
import { fetchModel, modelLabel, type ModelSize } from './model-store.ts';
import { DepthPassRenderer } from './renderer.ts';

const FACING_MODES = ['front', 'back'] as const;
const CAMERA_FRAME_RATE = 60;
const DEMO_IMAGE_URL = '/TypeGPU/assets/depthart/demo.jpg';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const video = document.querySelector('video') as HTMLVideoElement;
const status = document.querySelector('.status') as HTMLDivElement;
const statusMessage = document.querySelector('.status-message') as HTMLParagraphElement;
const listenerController = new AbortController();

let root: TgpuRoot | undefined;
let plan: DepthInferencePlan | undefined;
let renderer: DepthPassRenderer | undefined;
let chooser: SourceChooser | undefined;
let disposed = false;
let deviceLost = false;
let currentBundle: string | undefined;
let demoImage: ImageBitmap | undefined;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function setStatus(tone: 'busy' | 'error', message: string): void {
  status.dataset.tone = tone;
  status.hidden = false;
  statusMessage.textContent = message;
}

function clearTransientStatus(): void {
  if (status.dataset.tone === 'busy') {
    status.hidden = true;
  }
}

const camera = new DepthCameraSession(
  video,
  {
    onFrame: (frame) => {
      const activeRenderer = renderer;
      if (!activeRenderer || disposed || deviceLost) {
        return;
      }
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

/** A still source needs a single render - nothing changes between frames */
function renderStill(bitmap: ImageBitmap): void {
  const activeRenderer = renderer;
  if (!activeRenderer || disposed || deviceLost) {
    return;
  }
  const source = new VideoFrame(bitmap, { timestamp: performance.now() * 1000 });
  try {
    activeRenderer.render({ source, uvTransform: d.mat2x2f.identity(), swapAxes: false });
    clearTransientStatus();
  } catch (error) {
    if (!disposed && !deviceLost) {
      setStatus('error', `Rendering stopped: ${errorMessage(error)}`);
    }
  } finally {
    source.close();
  }
}

async function setFacing(facing: (typeof FACING_MODES)[number]): Promise<void> {
  camera.facingMode = facing === 'front' ? 'user' : 'environment';
  if (chooser?.source !== SourceChoice.CAMERA) {
    return;
  }
  renderer?.update({ mirror: facing === 'front' });
  if (!camera.active) {
    return;
  }
  camera.stop();
  try {
    await camera.start();
    renderer?.resetHistory();
  } catch (error) {
    setStatus('error', `Could not switch camera: ${errorMessage(error)}`);
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

async function startSource(source: SourceChoice, uploadedImage?: ImageBitmap): Promise<void> {
  if (source === SourceChoice.CAMERA) {
    setStatus('busy', 'Waiting for the camera…');
    renderer?.update({ mirror: camera.facingMode === 'user' });
    await camera.start();
    renderer?.resetHistory();
    return;
  }
  setStatus('busy', 'Preparing the photo…');
  const bitmap =
    source === SourceChoice.UPLOAD && uploadedImage ? uploadedImage : await loadDemoImage();
  renderer?.update({ mirror: false });
  renderer?.resetHistory();
  renderStill(bitmap);
}

async function attachBundle(bytes: ArrayBuffer): Promise<void> {
  const activeRoot = root;
  if (!activeRoot || disposed || deviceLost) {
    return;
  }
  const bundle = parseDepthBundle(bytes);
  setStatus('busy', `Compiling ${bundle.model} pipelines…`);
  const nextPlan = new DepthInferencePlan(activeRoot, bundle);
  try {
    await nextPlan.initAsync();
    if (disposed || deviceLost) {
      nextPlan.destroy();
      return;
    }
    if (!renderer) {
      const nextRenderer = new DepthPassRenderer(activeRoot, canvas);
      await nextRenderer.initAsync();
      renderer = nextRenderer;
    }
  } catch (error) {
    nextPlan.destroy();
    throw error;
  }
  renderer.attach(nextPlan);
  plan?.destroy();
  plan = nextPlan;
}

async function loadModel(size: ModelSize): Promise<boolean> {
  const variant = chooser?.variant(size);
  if (!variant) {
    setStatus('error', `The ${size} model is unavailable on this device.`);
    return false;
  }
  const label = modelLabel(size, variant);
  try {
    setStatus('busy', `Downloading ${label}…`);
    await attachBundle(await fetchModel(variant, listenerController.signal));
    currentBundle = variant.bundle;
    return true;
  } catch (error) {
    if (!disposed) {
      setStatus('error', `Could not load ${label}: ${errorMessage(error)}`);
    }
    return false;
  }
}

function showChooser(errorText?: string): void {
  camera.stop();
  status.hidden = true;
  chooser?.show(errorText);
}

async function start(): Promise<void> {
  if (!chooser) {
    return;
  }
  chooser.hide();
  if (chooser.variant(chooser.model)?.bundle !== currentBundle || !plan) {
    const loaded = await loadModel(chooser.model);
    if (!loaded || disposed || deviceLost) {
      if (!disposed && !deviceLost) {
        showChooser(statusMessage.textContent ?? 'Could not load the model.');
      }
      return;
    }
  }
  try {
    await startSource(chooser.source, chooser.uploadedImage);
  } catch (error) {
    if (!disposed && !deviceLost) {
      showChooser(`Could not start: ${errorMessage(error)}`);
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
    chooser = new SourceChooser(
      nextRoot.device.features.has('shader-f16'),
      start,
      listenerController.signal,
    );
    void nextRoot.device.lost.then((info) => {
      if (disposed) {
        return;
      }
      deviceLost = true;
      camera.stop();
      setStatus('error', `GPU device lost: ${info.message || info.reason}`);
    });
    showChooser();
  } catch (error) {
    if (!disposed) {
      setStatus('error', `Could not start: ${errorMessage(error)}`);
    }
  }
}

void initialize();

// #region Example controls and cleanup

export const controls = defineControls({
  'switch model / source': {
    onButtonClick: showChooser,
  },
  camera: {
    initial: FACING_MODES[0],
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
  chooser?.destroy();
  demoImage?.close();
  camera.destroy();
  renderer?.destroy();
  plan?.destroy();
  root?.destroy();
}

// #endregion
