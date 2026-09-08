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
  fireColorAccess,
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
import { EventHandler } from './events.ts';

type Rgba16Texture = TgpuTexture<{ size: [number, number]; format: 'rgba16float' }> &
  SampledFlag &
  StorageFlag;
type R32Texture = TgpuTexture<{ size: [number, number]; format: 'r32float' }> &
  SampledFlag &
  StorageFlag;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const clockUniform = root.createUniform(Clock, {
  time: 0,
  dt: defaults.timestep / 60,
});
const brushUniform = root.createUniform(BrushParams, {
  stampPos: d.vec2u(),
  radius: defaults.brushRadius,
  isSoft: defaults.softBrush ? 1 : 0,
});
const advectionUniform = root.createUniform(AdvectionParams, {
  brushMode: brushModes.indexOf(defaults.brushMode),
  isMouseDown: 0,
  mouseVelocity: d.vec2f(),
  densityDecay: defaults.densityDecay,
  tempDecay: defaults.tempDecay,
});
const forceUniform = root.createUniform(ForceParams, {
  buoyancy: defaults.buoyancy,
  vorticityStrength: defaults.vorticityStrength,
  thermalStrength: defaults.thermalStrength,
});

const noiseCache = perlin3d.staticCache({ root, size: d.vec3u(32, 32, 32) });

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
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
  magFilter: 'linear',
  minFilter: 'linear',
});

const particleBuffer = root.createBuffer(ParticleArray).$usage('storage').$name('particles');
const particleComputeBg = root.createBindGroup(particleComputeLayout, {
  particles: particleBuffer,
});

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

const textInsidePressure = root.createUniform(d.f32, defaults.textInsidePressure);
const tempPower = root.createUniform(d.f32, defaults.tempPower);
const fireColor = root.createUniform(d.vec3f, defaults.fireColor);
const particleSize = root.createUniform(d.f32, defaults.particleSize);

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

const fluidRoot = root
  .with(clockAccess, clockUniform)
  .with(advectionAccess, advectionUniform)
  .with(brushAccess, brushUniform)
  .with(insidePressureAccess, textInsidePressure)
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
  .with(particleSizeAccess, particleSize)
  .with(fireColorAccess, fireColor)
  .createRenderPipeline({
    vertex: particleVertex,
    fragment: particleFragment,
    primitive: { topology: 'triangle-strip' },
    targets: {
      color: {
        format: presentationFormat,
        blend: {
          color: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
          alpha: { operation: 'add', srcFactor: 'one', dstFactor: 'one' },
        },
      },
    },
  });

const displayRoot = root.with(tempPowerAccess, tempPower).with(fireColorAccess, fireColor);
const displayPipelines = [
  displayRoot.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: smokeFragment,
    targets: { format: presentationFormat },
  }),
  displayRoot.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: densityFragment,
    targets: { format: presentationFormat },
  }),
  displayRoot.createRenderPipeline({
    vertex: common.fullScreenTriangle,
    fragment: velocityFragment,
    targets: { format: presentationFormat },
  }),
];

function simulate(pass: GPUComputePassEncoder) {
  even = 1 - even;

  brushUniform.patch({ stampPos: events.texPos });
  advectionUniform.patch({
    isMouseDown: events.isMouseDown ? 1 : 0,
    mouseVelocity:
      brushModes[brushMode] === 'Velocity' ? events.consumePointerVelocity() : d.vec2f(),
  });

  const gridWg = Math.ceil(currentTextureSize / 16);

  advectionPipeline
    .with(pass)
    .with(smokeBgs[even])
    .with(sourceBg)
    .dispatchWorkgroups(gridWg, gridWg);

  if (events.isMouseDown && brushModes[brushMode] === 'Constant Source') {
    const stampWg = Math.ceil((brushRadius * 2 + 1) / 16);
    stampPipeline.with(pass).with(stampSourceBg).dispatchWorkgroups(stampWg, stampWg);
  }

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
    .with(smokeBgs[even])
    .with(particleComputeBg)
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
      .withColorAttachment({ color: { view: context, loadOp: 'load' } })
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
      fireColor.write(value);
    },
  },

  'Flame Color Contrast': {
    initial: defaults.tempPower,
    min: 0.5,
    max: 10,
    step: 0.1,
    onSliderChange: (val) => {
      tempPower.write(val);
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
      particleSize.write(val);
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
      textInsidePressure.write(val);
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
