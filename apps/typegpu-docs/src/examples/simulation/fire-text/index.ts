import {
  tgpu,
  d,
  common,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuTexture,
} from 'typegpu';
import { perlin3d } from '@typegpu/noise';
import { rgbToHsv } from '@typegpu/color';
import {
  advection,
  advectionAccess,
  divergence,
  forceAccess,
  gradientSubtraction,
  insidePressureAccess,
  pressureJacobi,
  stamp,
  vorticity,
} from './fluid.ts';
import {
  particleFragment,
  particleSizeAccess,
  particleVertex,
  updateParticles,
} from './particles.ts';
import { densityFragment, smokeFragment, tempPowerAccess, velocityFragment } from './render.ts';
import {
  AdvectionParams,
  brushAccess,
  brushModes,
  BrushParams,
  clockAccess,
  Clock,
  defaults,
  fireColorHsvAccess,
  ForceParams,
  ParticleArray,
  renderModes,
  textureSizeOptions,
} from './params.ts';
import {
  constantSourceLayout,
  displayLayout,
  divergenceLayout,
  particleComputeLayout,
  particleRenderLayout,
  pressureLayout,
  smokeLayout,
  sourceLayout,
} from './layouts.ts';
import { createTextMask } from './text.ts';
import { defineControls } from '../../common/defineControls.ts';
import { EventHandler, strokeAabb } from './events.ts';

type Rgba16Texture = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> &
  SampledFlag &
  StorageFlag;
type R32Texture = TgpuTexture<{ size: [number, number]; format: 'r32float' }> &
  SampledFlag &
  StorageFlag;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const clockUniform = root.createUniform(Clock);
const brushUniform = root.createUniform(BrushParams, {
  oldStampPos: [0, 0],
  newStampPos: [0, 0],
  origin: [0, 0],
  radius: defaults.brushRadius,
  isSoft: defaults.softBrush ? 1 : 0,
});
const advectionUniform = root.createUniform(AdvectionParams, {
  brushMode: brushModes.indexOf(defaults.brushMode),
  isMouseDown: 0,
  mouseVelocity: [0, 0],
  densityDecay: defaults.densityDecay,
  tempDecay: defaults.tempDecay,
});
const forceUniform = root.createUniform(ForceParams, {
  buoyancy: defaults.buoyancy,
  vorticityStrength: defaults.vorticityStrength,
  thermalStrength: defaults.thermalStrength,
});

const noiseCache = perlin3d.staticCache({ root, size: d.vec3u(32) });

function createSimTexture(size: number, format: 'rgba16float'): Rgba16Texture;
function createSimTexture(size: number, format: 'r32float'): R32Texture;
function createSimTexture(size: number, format: 'rgba16float' | 'r32float') {
  return root.createTexture({ size: [size, size], format }).$usage('storage', 'sampled');
}

function pingPong<T>(make: (src: 0 | 1, dst: 0 | 1) => T): [T, T] {
  return [make(0, 1), make(1, 0)];
}

let smokeGrid: [Rgba16Texture, Rgba16Texture];
let constantSourceGrid: R32Texture;
let textSourceGrid: R32Texture;
let textFillGrid: R32Texture;
let pressureGrid: [R32Texture, R32Texture];
let divergenceGrid: R32Texture;
let gridsReady = false;

function gridTextures() {
  return [
    smokeGrid[0],
    smokeGrid[1],
    constantSourceGrid,
    textSourceGrid,
    textFillGrid,
    pressureGrid[0],
    pressureGrid[1],
    divergenceGrid,
  ];
}

function recreateGridTextures(size: number) {
  if (gridsReady) {
    for (const tex of gridTextures()) {
      tex.destroy();
    }
  }

  smokeGrid = [createSimTexture(size, 'rgba16float'), createSimTexture(size, 'rgba16float')];
  constantSourceGrid = createSimTexture(size, 'r32float');
  textSourceGrid = createSimTexture(size, 'r32float');
  textFillGrid = createSimTexture(size, 'r32float');
  pressureGrid = [createSimTexture(size, 'r32float'), createSimTexture(size, 'r32float')];
  divergenceGrid = createSimTexture(size, 'r32float');
  gridsReady = true;
}

const linearSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const particleBuffer = root.createBuffer(ParticleArray).$usage('storage');

let smokeBgs: [
  TgpuBindGroup<typeof smokeLayout.entries>,
  TgpuBindGroup<typeof smokeLayout.entries>,
];
let sourceBg: TgpuBindGroup<typeof sourceLayout.entries>;
let stampSourceBg: TgpuBindGroup<typeof constantSourceLayout.entries>;
let divergenceBg: TgpuBindGroup<typeof divergenceLayout.entries>;
let pressureBgs: [
  TgpuBindGroup<typeof pressureLayout.entries>,
  TgpuBindGroup<typeof pressureLayout.entries>,
];
let particleComputeBgs: [
  TgpuBindGroup<typeof particleComputeLayout.entries>,
  TgpuBindGroup<typeof particleComputeLayout.entries>,
];
let particleRenderBg: TgpuBindGroup<typeof particleRenderLayout.entries>;
let displayBgs: [
  TgpuBindGroup<typeof displayLayout.entries>,
  TgpuBindGroup<typeof displayLayout.entries>,
];

function rebuildBindGroups() {
  smokeBgs = pingPong((src, dst) =>
    root.createBindGroup(smokeLayout, {
      linearSampler,
      inTex: smokeGrid[src],
      outTex: smokeGrid[dst],
      textTex: textSourceGrid,
    }),
  );

  sourceBg = root.createBindGroup(sourceLayout, { tex: constantSourceGrid });
  stampSourceBg = root.createBindGroup(constantSourceLayout, { tex: constantSourceGrid });

  divergenceBg = root.createBindGroup(divergenceLayout, {
    divTex: divergenceGrid,
    textTex: textFillGrid,
    pressureTex: pressureGrid[0],
  });

  pressureBgs = pingPong((src, dst) =>
    root.createBindGroup(pressureLayout, {
      inTex: pressureGrid[src],
      outTex: pressureGrid[dst],
      divTex: divergenceGrid,
    }),
  );

  particleComputeBgs = pingPong((_src, dst) =>
    root.createBindGroup(particleComputeLayout, {
      particles: particleBuffer,
      linearSampler,
      inTex: smokeGrid[dst],
      textTex: textSourceGrid,
    }),
  );

  particleRenderBg = root.createBindGroup(particleRenderLayout, {
    particles: particleBuffer,
    textTex: textSourceGrid,
  });

  displayBgs = pingPong((_src, dst) =>
    root.createBindGroup(displayLayout, {
      linearSampler,
      displayTex: smokeGrid[dst],
    }),
  );
}

let currentTextureSize = defaults.textureSize;
let solverIterations = defaults.solverIterations;
let numParticles = defaults.numParticles;
let brushMode = brushModes.indexOf(defaults.brushMode);
let renderMode = renderModes.indexOf(defaults.renderMode);
let brushRadius = defaults.brushRadius;
let timestep = defaults.timestep;
let even = 0;
let lastFrameTime: number | undefined;

const events = new EventHandler(canvas, () => currentTextureSize);

const textInsidePressureUniform = root.createUniform(d.f32, defaults.textInsidePressure);
const tempPowerUniform = root.createUniform(d.f32, defaults.tempPower);
const fireColorHsvUniform = root.createUniform(d.vec3f, rgbToHsv(defaults.fireColor));
const particleSizeUniform = root.createUniform(d.f32, defaults.particleSize);

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
  particleBuffer.clear();
  textMask.setTextureSize(newSize);
}

const fluidRoot = root
  .with(clockAccess, clockUniform)
  .with(advectionAccess, advectionUniform)
  .with(brushAccess, brushUniform)
  .with(insidePressureAccess, textInsidePressureUniform)
  .with(forceAccess, forceUniform)
  .pipe(noiseCache.inject());

const advectionPipeline = fluidRoot.createComputePipeline({ compute: advection });
const divergencePipeline = fluidRoot.createComputePipeline({ compute: divergence });
const pressurePipeline = fluidRoot.createComputePipeline({ compute: pressureJacobi });
const gradientPipeline = fluidRoot.createComputePipeline({ compute: gradientSubtraction });
const vorticityPipeline = fluidRoot.createComputePipeline({ compute: vorticity });
const stampPipeline = root
  .with(brushAccess, brushUniform)
  .createComputePipeline({ compute: stamp });

const particleComputePipeline = root
  .with(clockAccess, clockUniform)
  .createComputePipeline({ compute: updateParticles });

const particlePipeline = root
  .with(particleSizeAccess, particleSizeUniform)
  .with(fireColorHsvAccess, fireColorHsvUniform)
  .createRenderPipeline({
    vertex: particleVertex,
    fragment: particleFragment,
    primitive: { topology: 'triangle-strip' },
    targets: {
      blend: {
        color: { srcFactor: 'one', dstFactor: 'one' },
        alpha: { srcFactor: 'one', dstFactor: 'one' },
      },
    },
  });

const displayRoot = root
  .with(tempPowerAccess, tempPowerUniform)
  .with(fireColorHsvAccess, fireColorHsvUniform);
const displayPipelines = [smokeFragment, densityFragment, velocityFragment].map((fragment) =>
  displayRoot.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment,
  }),
);

function simulate(pass: GPUComputePassEncoder) {
  even = 1 - even;

  const from = events.prevTexPos;
  const to = events.texPos;
  const painting = events.isPainting;
  const stampBounds =
    painting && brushModes[brushMode] === 'Constant Source'
      ? strokeAabb(from, to, brushRadius, currentTextureSize)
      : undefined;

  brushUniform.patch({
    oldStampPos: from,
    newStampPos: to,
    origin: stampBounds ? [stampBounds.originX, stampBounds.originY] : [0, 0],
  });
  advectionUniform.patch({
    isMouseDown: painting ? 1 : 0,
    mouseVelocity: brushModes[brushMode] === 'Velocity' ? events.pointerVelocity() : [0, 0],
  });

  const gridWg = Math.ceil(currentTextureSize / 16);

  advectionPipeline
    .with(pass)
    .with(smokeBgs[even])
    .with(sourceBg)
    .dispatchWorkgroups(gridWg, gridWg);

  if (stampBounds) {
    stampPipeline
      .with(pass)
      .with(stampSourceBg)
      .dispatchWorkgroups(Math.ceil(stampBounds.width / 16), Math.ceil(stampBounds.height / 16));
  }

  events.commitStroke();

  vorticityPipeline
    .with(pass)
    .with(smokeBgs[1 - even])
    .dispatchWorkgroups(gridWg, gridWg);

  divergencePipeline
    .with(pass)
    .with(divergenceBg)
    .with(smokeBgs[even])
    .dispatchWorkgroups(gridWg, gridWg);

  // Pressure Jacobi
  let pEven = 0;
  for (let i = 0; i < solverIterations; i++) {
    pressurePipeline.with(pass).with(pressureBgs[pEven]).dispatchWorkgroups(gridWg, gridWg);
    pEven = 1 - pEven;
  }

  gradientPipeline
    .with(pass)
    .with(smokeBgs[even])
    .with(pressureBgs[pEven])
    .dispatchWorkgroups(gridWg, gridWg);

  particleComputePipeline
    .with(pass)
    .with(particleComputeBgs[even])
    .dispatchWorkgroups(Math.ceil(numParticles / 256));
}

let animationFrameId: number;

function frame() {
  if (canvas.width === 0 || canvas.height === 0) {
    animationFrameId = requestAnimationFrame(frame);
    return;
  }

  const now = performance.now();
  const deltaSeconds =
    lastFrameTime === undefined ? 1 / 60 : Math.min((now - lastFrameTime) / 1000, 1 / 30);
  lastFrameTime = now;

  clockUniform.write({
    time: now / 1000,
    dt: timestep * deltaSeconds,
  });

  const encoder = root.device.createCommandEncoder();
  const computePass = encoder.beginComputePass();
  simulate(computePass);
  computePass.end();

  const activePipeline = displayPipelines[renderMode];
  activePipeline
    .withColorAttachment({ view: context })
    .with(displayBgs[even])
    .with(encoder)
    .draw(3);

  if (renderModes[renderMode] === 'Fire') {
    particlePipeline
      .with(particleRenderBg)
      .withColorAttachment({ view: context, loadOp: 'load' })
      .with(encoder)
      .draw(4, numParticles);
  }

  root.device.queue.submit([encoder.finish()]);

  animationFrameId = requestAnimationFrame(frame);
}

animationFrameId = requestAnimationFrame(frame);

// #region Example controls and cleanup
export const controls = defineControls({
  Text: {
    initial: defaults.text,
    onTextChange: textMask.setText,
  },

  'Blink Cursor': {
    initial: defaults.cursorBlink,
    onToggleChange: textMask.setCursorBlink,
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
      for (const tex of gridTextures()) {
        tex.clear();
      }
      particleBuffer.clear();
      textMask.uploadMask();
    },
  },

  'Brush Mode': {
    initial: defaults.brushMode,
    options: brushModes,
    onSelectChange: (newMode) => {
      brushMode = brushModes.indexOf(newMode);
      advectionUniform.patch({ brushMode });
    },
  },

  'Brush Radius': {
    initial: defaults.brushRadius,
    min: 1,
    max: 200,
    step: 1,
    onSliderChange: (val) => {
      brushRadius = val;
      brushUniform.patch({ radius: val });
    },
  },

  'Soft Brush': {
    initial: defaults.softBrush,
    onToggleChange: (val) => {
      brushUniform.patch({ isSoft: val ? 1 : 0 });
    },
  },

  'Render Mode': {
    initial: defaults.renderMode,
    options: renderModes,
    onSelectChange: (newMode) => {
      renderMode = renderModes.indexOf(newMode);
    },
  },

  'Flame Color': {
    initial: defaults.fireColor,
    onColorChange: (value) => {
      fireColorHsvUniform.write(rgbToHsv(value));
    },
  },

  'Flame Color Gamma': {
    initial: defaults.tempPower,
    min: 0.5,
    max: 10,
    step: 0.1,
    onSliderChange: (val) => {
      tempPowerUniform.write(val);
    },
  },

  'Particle Count': {
    initial: defaults.numParticles,
    min: 0,
    max: defaults.maxParticles,
    step: 1000,
    onSliderChange: (val) => {
      numParticles = val;
    },
  },

  'Particle Size': {
    initial: defaults.particleSize,
    min: 0.1,
    max: 5,
    step: 0.1,
    onSliderChange: (val) => {
      particleSizeUniform.write(val);
    },
  },

  'Timestep (dt)': {
    initial: defaults.timestep,
    min: 0,
    max: 3,
    step: 0.1,
    onSliderChange: (val) => {
      timestep = val;
    },
  },

  'Solver Iterations': {
    initial: defaults.solverIterations,
    min: 1,
    max: 300,
    step: 2,
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
      forceUniform.patch({ buoyancy: val });
    },
  },

  'Vorticity Confinement': {
    initial: defaults.vorticityStrength,
    min: 0,
    max: 150,
    step: 1,
    onSliderChange: (val) => {
      forceUniform.patch({ vorticityStrength: val });
    },
  },

  'Thermal Confinement': {
    initial: defaults.thermalStrength,
    min: 0,
    max: 150,
    step: 1,
    onSliderChange: (val) => {
      forceUniform.patch({ thermalStrength: val });
    },
  },

  'Pressure Inside Text': {
    initial: defaults.textInsidePressure,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange: (val) => {
      textInsidePressureUniform.write(val);
    },
  },

  'Density Retention': {
    initial: defaults.densityDecay,
    min: 0.9,
    max: 1,
    step: 0.0001,
    onSliderChange: (val) => {
      advectionUniform.patch({ densityDecay: val });
    },
  },

  'Heat Retention': {
    initial: defaults.tempDecay,
    min: 0.9,
    max: 1,
    step: 0.0001,
    onSliderChange: (val) => {
      advectionUniform.patch({ tempDecay: val });
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrameId);
  textMask.cleanup();
  root.destroy();
  events.cleanup();
}
// #endregion
