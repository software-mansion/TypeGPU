import {
  tgpu,
  d,
  common,
  type SampledFlag,
  type StorageFlag,
  type TgpuBindGroup,
  type TgpuTexture,
  type TgpuComputePass,
} from 'typegpu';
import { perlin3d } from '@typegpu/noise';
import { rgbToHsv } from '@typegpu/color';
import {
  advection,
  divergence,
  gradientSubtraction,
  pressureJacobi,
  stamp,
  vorticity,
} from './fluid.ts';
import { particleFragment, particleVertex, updateParticles } from './particles.ts';
import { densityFragment, smokeFragment, velocityFragment } from './render.ts';
import {
  brush,
  brushModes,
  BrushParams,
  defaults,
  ParticleArray,
  renderModes,
  shading,
  ShadingParams,
  sim,
  SimParams,
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
type Rg32Texture = TgpuTexture<{ size: [number, number]; format: 'rg32float' }> &
  SampledFlag &
  StorageFlag;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const simUniform = root.createUniform(SimParams);
const brushUniform = root.createUniform(BrushParams);
const shadingUniform = root.createUniform(ShadingParams);

const noiseCache = perlin3d.staticCache({ root, size: d.vec3u(32) });
const configured = root
  .with(sim, simUniform)
  .with(brush, brushUniform)
  .with(shading, shadingUniform)
  .pipe(noiseCache.inject());

function createSimTexture(size: number, format: 'rgba16float'): Rgba16Texture;
function createSimTexture(size: number, format: 'r32float'): R32Texture;
function createSimTexture(size: number, format: 'rg32float'): Rg32Texture;
function createSimTexture(size: number, format: 'rgba16float' | 'r32float' | 'rg32float') {
  return root.createTexture({ size: [size, size], format }).$usage('storage', 'sampled');
}

function pingPong<T>(make: (src: 0 | 1, dst: 0 | 1) => T): [T, T] {
  return [make(0, 1), make(1, 0)];
}

let smokeGrid: [Rgba16Texture, Rgba16Texture];
let constantSourceGrid: R32Texture;
let textGrid: Rg32Texture;
let pressureGrid: [R32Texture, R32Texture];
let divergenceGrid: R32Texture;
let gridsReady = false;

function simTextures() {
  return [
    smokeGrid[0],
    smokeGrid[1],
    constantSourceGrid,
    pressureGrid[0],
    pressureGrid[1],
    divergenceGrid,
  ];
}

function gridTextures() {
  return [...simTextures(), textGrid];
}

function recreateGridTextures(size: number) {
  if (gridsReady) {
    for (const tex of gridTextures()) {
      tex.destroy();
    }
  }

  smokeGrid = [createSimTexture(size, 'rgba16float'), createSimTexture(size, 'rgba16float')];
  constantSourceGrid = createSimTexture(size, 'r32float');
  textGrid = createSimTexture(size, 'rg32float');
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
let particleComputeBgs: TgpuBindGroup<typeof particleComputeLayout.entries>;

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
      textTex: textGrid,
    }),
  );

  sourceBg = root.createBindGroup(sourceLayout, { tex: constantSourceGrid });
  stampSourceBg = root.createBindGroup(constantSourceLayout, { tex: constantSourceGrid });

  divergenceBg = root.createBindGroup(divergenceLayout, {
    divTex: divergenceGrid,
    textTex: textGrid,
    pressureTex: pressureGrid[0],
  });

  pressureBgs = pingPong((src, dst) =>
    root.createBindGroup(pressureLayout, {
      inTex: pressureGrid[src],
      outTex: pressureGrid[dst],
      divTex: divergenceGrid,
    }),
  );

  particleComputeBgs = root.createBindGroup(particleComputeLayout, {
    particles: particleBuffer,
  });

  particleRenderBg = root.createBindGroup(particleRenderLayout, {
    particles: particleBuffer,
    textTex: textGrid,
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
let lastFrameTime = performance.now();

const events = new EventHandler(canvas, () => currentTextureSize);

const baseFireHsv = rgbToHsv(defaults.fireColor);

recreateGridTextures(defaults.textureSize);
rebuildBindGroups();

const textMask = createTextMask({
  getTextGrid: () => textGrid,
  textureSize: currentTextureSize,
});

function updateTextureSize(newSize: number) {
  if (newSize === currentTextureSize) {
    return;
  }

  currentTextureSize = newSize;
  recreateGridTextures(newSize);
  rebuildBindGroups();
  particleBuffer.clear();
  textMask.setTextureSize(newSize);
}

const advectionPipeline = configured.createComputePipeline({ compute: advection });
const divergencePipeline = configured.createComputePipeline({ compute: divergence });
const pressurePipeline = configured.createComputePipeline({ compute: pressureJacobi });
const gradientPipeline = configured.createComputePipeline({ compute: gradientSubtraction });
const vorticityPipeline = configured.createComputePipeline({ compute: vorticity });
const stampPipeline = configured.createComputePipeline({ compute: stamp });

const particleComputePipeline = configured.createComputePipeline({ compute: updateParticles });

const particlePipeline = configured.createRenderPipeline({
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

const displayPipelines = [smokeFragment, densityFragment, velocityFragment].map((fragment) =>
  configured.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment,
  }),
);

function simulate(pass: TgpuComputePass) {
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
    isBrushing: painting && brushModes[brushMode] !== 'Constant Source' ? 1 : 0,
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
    .with(particleComputeBgs)
    .with(smokeBgs[even])
    .dispatchWorkgroups(Math.ceil(numParticles / 256));
}

let animationFrameId: number;

function frame(now: number) {
  even = 1 - even;

  const deltaSeconds = Math.min((now - lastFrameTime) / 1000, 1 / 30);
  lastFrameTime = now;

  simUniform.patch({
    time: now / 1000,
    dt: timestep * deltaSeconds,
  });

  const encoder = root['~unstable'].createCommandEncoder();
  const computePass = encoder.beginComputePass();
  simulate(computePass);
  computePass.end();

  const renderPass = encoder.beginRenderPass({
    colorAttachments: [{ view: context }],
  });
  displayPipelines[renderMode].with(displayBgs[even]).with(renderPass).draw(3);
  if (renderModes[renderMode] === 'Fire') {
    particlePipeline.with(particleRenderBg).with(renderPass).draw(4, numParticles);
  }
  renderPass.end();

  encoder.submit();

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
      for (const tex of simTextures()) {
        tex.clear();
      }
      particleBuffer.clear();
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
      const hsv = rgbToHsv(value);
      shadingUniform.patch({ fireTint: [hsv.x - baseFireHsv.x, hsv.y / baseFireHsv.y] });
    },
  },

  'Flame Color Gamma': {
    initial: defaults.tempPower,
    min: 0.5,
    max: 10,
    step: 0.1,
    onSliderChange: (val) => {
      shadingUniform.patch({ tempPower: val });
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
      shadingUniform.patch({ particleSize: val });
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
      simUniform.patch({ buoyancy: val });
    },
  },

  'Vorticity Confinement': {
    initial: defaults.vorticityStrength,
    min: 0,
    max: 150,
    step: 1,
    onSliderChange: (val) => {
      simUniform.patch({ vorticityStrength: val });
    },
  },

  'Thermal Confinement': {
    initial: defaults.thermalStrength,
    min: 0,
    max: 150,
    step: 1,
    onSliderChange: (val) => {
      simUniform.patch({ thermalStrength: val });
    },
  },

  'Pressure Inside Text': {
    initial: defaults.textInsidePressure,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange: (val) => {
      simUniform.patch({ textInsidePressure: val });
    },
  },

  'Density Retention': {
    initial: defaults.densityDecay,
    min: 0.9,
    max: 1,
    step: 0.0001,
    onSliderChange: (val) => {
      simUniform.patch({ densityDecay: val });
    },
  },

  'Heat Retention': {
    initial: defaults.tempDecay,
    min: 0.9,
    max: 1,
    step: 0.0001,
    onSliderChange: (val) => {
      simUniform.patch({ tempDecay: val });
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
