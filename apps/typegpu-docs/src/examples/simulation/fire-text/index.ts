import { tgpu, d, type SampledFlag, type StorageFlag, type TgpuTexture } from 'typegpu';
import { perlin3d } from '@typegpu/noise';
import { brushModes, Config, defaults, renderModes, textureSizeOptions } from './config.ts';
import { createFluidBindGroups, createFluidPipelines } from './fluid.ts';
import { createEmitterBindGroup, createStampPipeline } from './emitter.ts';
import { createParticleRenderBindGroup, createParticles } from './particles.ts';
import { createDisplayBindGroups, createRenderPipelines } from './render.ts';
import { createTextMask } from './text.ts';
import { defineControls } from '../../common/defineControls.ts';

type Rgba16Texture = TgpuTexture & SampledFlag & StorageFlag;
type R32Texture = TgpuTexture & SampledFlag & StorageFlag;

// #region Setup

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const configUniform = root.createUniform(Config);
const noiseCache = perlin3d.staticCache({ root, size: d.vec3u(32, 32, 32) });

function createRgba16StorageSampledTexture(size: number, name: string): Rgba16Texture {
  return root
    .createTexture({ size: [size, size], format: 'rgba16float' })
    .$usage('storage', 'sampled')
    .$name(name);
}

function createR32StorageSampledTexture(size: number, name: string): R32Texture {
  return root
    .createTexture({ size: [size, size], format: 'r32float' })
    .$usage('storage', 'sampled')
    .$name(name);
}

let smokeGrid: [Rgba16Texture, Rgba16Texture];
let constantSourceGrid: R32Texture;
let textSourceGrid: R32Texture;
let textFillGrid: R32Texture;
let pressureGrid: [R32Texture, R32Texture];
let divergenceGrid: Rgba16Texture;

function recreateGridTextures(size: number) {
  if (smokeGrid) {
    smokeGrid[0].destroy();
    smokeGrid[1].destroy();
    constantSourceGrid.destroy();
    textSourceGrid.destroy();
    textFillGrid.destroy();
    pressureGrid[0].destroy();
    pressureGrid[1].destroy();
    divergenceGrid.destroy();
  }

  smokeGrid = [
    createRgba16StorageSampledTexture(size, 'smoke0'),
    createRgba16StorageSampledTexture(size, 'smoke1'),
  ];

  constantSourceGrid = createR32StorageSampledTexture(size, 'constantSource');
  textSourceGrid = createR32StorageSampledTexture(size, 'textSource');
  textFillGrid = createR32StorageSampledTexture(size, 'textFill');

  pressureGrid = [
    createR32StorageSampledTexture(size, 'pressure0'),
    createR32StorageSampledTexture(size, 'pressure1'),
  ];

  divergenceGrid = createRgba16StorageSampledTexture(size, 'divergence');
}

const linearSampler = root.createSampler({
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
  magFilter: 'linear',
  minFilter: 'linear',
});

const nearestSampler = root.createSampler({
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
  magFilter: 'nearest',
  minFilter: 'nearest',
});

// #endregion

// #region Pipelines (created once)

const fluid = createFluidPipelines(root, configUniform, noiseCache);
const stampConstant = createStampPipeline(root, configUniform);
const particles = createParticles(root, configUniform);
const render = createRenderPipelines(root, configUniform);

// #endregion

// #region Bind groups (rebuilt on resize/clear)

let fluidBgs: ReturnType<typeof createFluidBindGroups>;
let stampSourceBg: ReturnType<typeof createEmitterBindGroup>;
let particleRenderBg: ReturnType<typeof createParticleRenderBindGroup>;
let displayBgs: ReturnType<typeof createDisplayBindGroups>;

function rebuildBindGroups() {
  fluidBgs = createFluidBindGroups(root, {
    linearSampler,
    nearestSampler,
    smokeGrid,
    constantSourceGrid,
    textSourceGrid,
    textFillGrid,
    pressureGrid,
    divergenceGrid,
  });

  stampSourceBg = createEmitterBindGroup(root, { constantSourceGrid });

  particleRenderBg = createParticleRenderBindGroup(root, {
    particleBuffer: particles.particleBuffer,
    textSourceGrid,
  });

  displayBgs = createDisplayBindGroups(root, {
    linearSampler,
    smokeGrid,
  });
}

// #endregion

// #region Runtime state

let even = 0;

let isMouseDown = false;
let mouseTexX = -1000;
let mouseTexY = -1000;
let prevMouseTexX = -1000;
let prevMouseTexY = -1000;

let currentTextureSize: number = defaults.textureSize;
let solverIterations: number = defaults.solverIterations;
let numParticles: number = defaults.numParticles;
let textInsidePressure: number = defaults.textInsidePressure;
let brushMode: number = brushModes.indexOf(defaults.brushMode);
let renderMode: number = renderModes.indexOf(defaults.renderMode);
let buoyancy: number = defaults.buoyancy;
let radius: number = defaults.brushRadius;
let speed: number = defaults.timestep;
let isSoft: boolean = defaults.softBrush;
let tempPower: number = defaults.tempPower;
let particleSize: number = defaults.particleSize;
let densityDecay: number = defaults.densityDecay;
let tempDecay: number = defaults.tempDecay;
let vorticityStrength: number = defaults.vorticityStrength;
let thermalStrength: number = defaults.thermalStrength;

recreateGridTextures(defaults.textureSize);
rebuildBindGroups();

const textMask = createTextMask({
  getTextSourceGrid: () => textSourceGrid,
  getTextFillGrid: () => textFillGrid,
  getTextureSize: () => currentTextureSize,
  initialText: defaults.text,
});
textMask.start();

function updateTextureSize(newSize: number) {
  currentTextureSize = newSize;
  recreateGridTextures(newSize);
  rebuildBindGroups();
  textMask.setTextureSize(newSize);
}

// #endregion

// #region Pointer input

canvas.style.touchAction = 'none';

function canvasToTex(e: PointerEvent | MouseEvent) {
  const r = canvas.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) {
    return;
  }
  const u = (e.clientX - r.left) / r.width;
  const v = (e.clientY - r.top) / r.height;
  mouseTexX = Math.floor(u * currentTextureSize);
  mouseTexY = Math.floor(v * currentTextureSize);
}

function onPointerDown(e: PointerEvent) {
  isMouseDown = true;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // ignore
  }
  canvasToTex(e);
  prevMouseTexX = mouseTexX;
  prevMouseTexY = mouseTexY;
}

function onPointerMove(e: PointerEvent) {
  if (isMouseDown) {
    canvasToTex(e);
  }
}

function onPointerUp(e: PointerEvent) {
  isMouseDown = false;
  try {
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  } catch {
    // ignore
  }
}

function onPointerCancel(e: PointerEvent) {
  isMouseDown = false;
  try {
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
  } catch {
    // ignore
  }
}

canvas.addEventListener('pointerdown', onPointerDown);
canvas.addEventListener('pointermove', onPointerMove);
canvas.addEventListener('pointerup', onPointerUp);
canvas.addEventListener('pointercancel', onPointerCancel);

// #endregion

// #region Simulation & render loop

function callSimulate(encoder: GPUCommandEncoder) {
  even = 1 - even;

  let velocity = d.vec2f(0);
  if (brushMode === 2 && isMouseDown) {
    let dx = mouseTexX - prevMouseTexX;
    let dy = mouseTexY - prevMouseTexY;

    // Clamp dx to [-3, 3] so max velocity (90) is naturally reached on fast swipes,
    // while slow movement (e.g. 0.3px) produces small velocity (9).
    dx = Math.max(-3, Math.min(3, dx));
    dy = Math.max(-3, Math.min(3, dy));

    velocity = d.vec2f(dx * 30, dy * 30);
  }

  prevMouseTexX = mouseTexX;
  prevMouseTexY = mouseTexY;

  configUniform.patch({
    time: performance.now() / 1000,
    dt: speed / 60,
    stampPos: d.vec2u(mouseTexX, mouseTexY),
    velocity: velocity,
    buoyancy: buoyancy,
    radius: radius,
    isSoft: isSoft ? 1 : 0,
    isMouseDown: isMouseDown ? 1 : 0,
    brushMode: brushMode,
    textureSize: currentTextureSize,
    textInsidePressure: textInsidePressure,
    tempPower: tempPower,
    particleSize: particleSize,
    densityDecay: densityDecay,
    tempDecay: tempDecay,
    vorticityStrength: vorticityStrength,
    thermalStrength: thermalStrength,
  });

  fluid.advection
    .with(fluidBgs.smokeBgs[even])
    .with(encoder)
    .dispatchThreads(currentTextureSize, currentTextureSize);

  if (isMouseDown && brushMode === 1) {
    stampConstant
      .with(stampSourceBg)
      .with(encoder)
      .dispatchThreads(radius * 2 + 1, radius * 2 + 1);
  }

  fluid.vorticityConfinement
    .with(fluidBgs.smokeBgs[1 - even])
    .with(encoder)
    .dispatchThreads(currentTextureSize, currentTextureSize);

  fluid.divergence
    .with(fluidBgs.divergenceBg)
    .with(fluidBgs.smokeBgs[even])
    .with(encoder)
    .dispatchThreads(currentTextureSize, currentTextureSize);

  fluid.clearPressure
    .with(fluidBgs.clearPressureBgs[0])
    .with(encoder)
    .dispatchThreads(currentTextureSize, currentTextureSize);
  fluid.clearPressure
    .with(fluidBgs.clearPressureBgs[1])
    .with(encoder)
    .dispatchThreads(currentTextureSize, currentTextureSize);

  let pEven = 0;
  const totalIterations = solverIterations * 2;
  for (let i = 0; i < totalIterations; i++) {
    fluid.pressureSolverJacobi
      .with(fluidBgs.pressureBgs[pEven])
      .with(encoder)
      .dispatchThreads(currentTextureSize, currentTextureSize);
    pEven = 1 - pEven;
  }

  fluid.gradientSubtraction
    .with(fluidBgs.gradientBgs[even])
    .with(encoder)
    .dispatchThreads(currentTextureSize, currentTextureSize);

  particles.updateParticles
    .with(fluidBgs.smokeBgs[even])
    .with(particles.particleComputeBg)
    .with(encoder)
    .dispatchThreads(numParticles);
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const targetWidth = Math.max(1, Math.floor(rect.width * dpr));
  const targetHeight = Math.max(1, Math.floor(rect.height * dpr));

  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
}

const resizeObserver = new ResizeObserver(() => resizeCanvas());
resizeObserver.observe(canvas);
resizeCanvas();

let animationFrameId: number;

function frame() {
  if (canvas.width === 0 || canvas.height === 0) {
    animationFrameId = requestAnimationFrame(frame);
    return;
  }

  const encoder = root.device.createCommandEncoder();
  callSimulate(encoder);

  const activePipeline =
    renderMode === 1
      ? render.densityPipeline
      : renderMode === 2
        ? render.velocityPipeline
        : render.firePipeline;

  activePipeline
    .withColorAttachment({ view: context })
    .with(displayBgs[even])
    .with(encoder)
    .draw(3);

  particles.particlePipeline
    .with(particleRenderBg)
    .withColorAttachment({ color: { view: context, loadOp: 'load' } })
    .with(encoder)
    .draw(6, numParticles);

  root.device.queue.submit([encoder.finish()]);

  animationFrameId = requestAnimationFrame(frame);
}

animationFrameId = requestAnimationFrame(frame);

// #endregion

// #region Example controls and cleanup

export const controls = defineControls({
  Text: {
    initial: defaults.text,
    onTextChange: (val) => {
      textMask.setText(val);
    },
  },

  'Blink Cursor': {
    initial: defaults.cursorBlink,
    onToggleChange: (val) => {
      textMask.setCursorBlink(val);
    },
  },

  'Texture Size': {
    initial: String(defaults.textureSize) as (typeof textureSizeOptions)[number],
    options: textureSizeOptions,
    onSelectChange: (val) => {
      updateTextureSize(Number(val));
    },
  },

  'Clear All Grids': {
    onButtonClick: () => {
      recreateGridTextures(currentTextureSize);
      rebuildBindGroups();
      particles.particleBuffer.write(new Float32Array(particles.MAX_PARTICLES * 6).buffer);
      textMask.uploadMask();
    },
  },

  'Brush Mode': {
    initial: defaults.brushMode,
    options: brushModes,
    onSelectChange: (newMode) => {
      brushMode = brushModes.indexOf(newMode);
    },
  },

  'Brush Radius': {
    initial: defaults.brushRadius,
    min: 1,
    max: 200,
    step: 1,
    onSliderChange: (val) => {
      radius = val;
    },
  },

  'Soft Brush': {
    initial: defaults.softBrush,
    onToggleChange: (val) => {
      isSoft = val;
    },
  },

  'Render Mode': {
    initial: defaults.renderMode,
    options: renderModes,
    onSelectChange: (newMode) => {
      renderMode = renderModes.indexOf(newMode);
    },
  },

  'Flame Color Contrast': {
    initial: defaults.tempPower,
    min: 0.5,
    max: 10.0,
    step: 0.1,
    onSliderChange: (val) => {
      tempPower = val;
    },
  },

  'Particle Count': {
    initial: defaults.numParticles,
    min: 100,
    max: 10000,
    step: 100,
    onSliderChange: (val) => {
      numParticles = val;
    },
  },

  'Particle Size': {
    initial: defaults.particleSize,
    min: 0.1,
    max: 10.0,
    step: 0.1,
    onSliderChange: (val) => {
      particleSize = val;
    },
  },

  'Timestep (dt)': {
    initial: defaults.timestep,
    min: 0,
    max: 3,
    step: 0.1,
    onSliderChange: (val) => {
      speed = val;
    },
  },

  'Solver Iterations': {
    initial: defaults.solverIterations,
    min: 1,
    max: 300,
    step: 1,
    onSliderChange: (val) => {
      solverIterations = val;
    },
  },

  Buoyancy: {
    initial: defaults.buoyancy,
    min: 0,
    max: 250,
    step: 1,
    onSliderChange: (val) => {
      buoyancy = val;
    },
  },

  'Vorticity Confinement': {
    initial: defaults.vorticityStrength,
    min: 0.0,
    max: 150.0,
    step: 1.0,
    onSliderChange: (val) => {
      vorticityStrength = val;
    },
  },

  'Thermal Confinement': {
    initial: defaults.thermalStrength,
    min: 0.0,
    max: 150.0,
    step: 1.0,
    onSliderChange: (val) => {
      thermalStrength = val;
    },
  },

  'Pressure Inside Text': {
    initial: defaults.textInsidePressure,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange: (val) => {
      textInsidePressure = val;
    },
  },

  'Density Retention': {
    initial: defaults.densityDecay,
    min: 0.9,
    max: 1.0,
    step: 0.0001,
    onSliderChange: (val) => {
      densityDecay = val;
    },
  },

  'Heat Retention': {
    initial: defaults.tempDecay,
    min: 0.9,
    max: 1.0,
    step: 0.0001,
    onSliderChange: (val) => {
      tempDecay = val;
    },
  },
});

function hideHelp() {
  const helpElem = document.getElementById('help');
  if (helpElem) {
    helpElem.style.opacity = '0';
  }
}
for (const eventName of ['click', 'keydown', 'wheel', 'touchstart']) {
  canvas.addEventListener(eventName, hideHelp, { once: true, passive: true });
}

export function onCleanup() {
  cancelAnimationFrame(animationFrameId);
  resizeObserver.disconnect();
  canvas.removeEventListener('pointerdown', onPointerDown);
  canvas.removeEventListener('pointermove', onPointerMove);
  canvas.removeEventListener('pointerup', onPointerUp);
  canvas.removeEventListener('pointercancel', onPointerCancel);
  textMask.cleanup();
  root.destroy();
}

// #endregion
