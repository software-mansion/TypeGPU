import { tgpu, d, common, type TgpuComputePass } from 'typegpu';
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

const linearSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

const particleBuffer = root.createBuffer(ParticleArray).$usage('storage');

const particleComputeBg = root.createBindGroup(particleComputeLayout, {
  particles: particleBuffer,
});

function createGrids(size: number) {
  const smoke = () =>
    root.createTexture({ size: [size, size], format: 'rgba16float' }).$usage('storage', 'sampled');
  const field = () =>
    root.createTexture({ size: [size, size], format: 'r32float' }).$usage('storage', 'sampled');

  const textures = {
    smoke: [smoke(), smoke()],
    pressure: [field(), field()],
    constantSource: field(),
    divergence: field(),
    text: root
      .createTexture({ size: [size, size], format: 'rg32float' })
      .$usage('storage', 'sampled'),
  };

  const smokeGroup = (i: number) =>
    root.createBindGroup(smokeLayout, {
      linearSampler,
      inTex: textures.smoke[i],
      outTex: textures.smoke[1 - i],
      textTex: textures.text,
    });

  const pressureGroup = (i: number) =>
    root.createBindGroup(pressureLayout, {
      inTex: textures.pressure[i],
      outTex: textures.pressure[1 - i],
      divTex: textures.divergence,
    });

  const displayGroup = (i: number) =>
    root.createBindGroup(displayLayout, {
      linearSampler,
      displayTex: textures.smoke[1 - i],
    });

  return {
    textures,
    smoke: [smokeGroup(0), smokeGroup(1)],
    source: root.createBindGroup(sourceLayout, { tex: textures.constantSource }),
    stampSource: root.createBindGroup(constantSourceLayout, { tex: textures.constantSource }),
    divergence: root.createBindGroup(divergenceLayout, {
      divTex: textures.divergence,
      textTex: textures.text,
      pressureTex: textures.pressure[0],
    }),
    pressure: [pressureGroup(0), pressureGroup(1)],
    particleRender: root.createBindGroup(particleRenderLayout, {
      particles: particleBuffer,
      textTex: textures.text,
    }),
    display: [displayGroup(0), displayGroup(1)],
    clear() {
      for (const tex of [
        ...textures.smoke,
        ...textures.pressure,
        textures.constantSource,
        textures.divergence,
      ]) {
        tex.clear();
      }
    },
    destroy() {
      for (const tex of Object.values(textures).flat()) {
        tex.destroy();
      }
    },
  };
}

let grids = createGrids(defaults.textureSize);
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

const textMask = createTextMask({
  getTextGrid: () => grids.textures.text,
  textureSize: currentTextureSize,
});

function updateTextureSize(newSize: number) {
  if (newSize === currentTextureSize) {
    return;
  }

  currentTextureSize = newSize;
  grids.destroy();
  grids = createGrids(newSize);
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
    .with(grids.smoke[even])
    .with(grids.source)
    .dispatchWorkgroups(gridWg, gridWg);

  if (stampBounds) {
    stampPipeline
      .with(pass)
      .with(grids.stampSource)
      .dispatchWorkgroups(Math.ceil(stampBounds.width / 16), Math.ceil(stampBounds.height / 16));
  }
  events.commitStroke();

  vorticityPipeline
    .with(pass)
    .with(grids.smoke[1 - even])
    .dispatchWorkgroups(gridWg, gridWg);

  divergencePipeline
    .with(pass)
    .with(grids.divergence)
    .with(grids.smoke[even])
    .dispatchWorkgroups(gridWg, gridWg);

  // Pressure Jacobi
  let pEven = 0;
  for (let i = 0; i < solverIterations; i++) {
    pressurePipeline.with(pass).with(grids.pressure[pEven]).dispatchWorkgroups(gridWg, gridWg);
    pEven = 1 - pEven;
  }

  gradientPipeline
    .with(pass)
    .with(grids.smoke[even])
    .with(grids.pressure[pEven])
    .dispatchWorkgroups(gridWg, gridWg);

  particleComputePipeline
    .with(pass)
    .with(particleComputeBg)
    .with(grids.smoke[even])
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
  displayPipelines[renderMode].with(grids.display[even]).with(renderPass).draw(3);
  if (renderModes[renderMode] === 'Fire') {
    particlePipeline.with(grids.particleRender).with(renderPass).draw(4, numParticles);
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
      grids.clear();
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
