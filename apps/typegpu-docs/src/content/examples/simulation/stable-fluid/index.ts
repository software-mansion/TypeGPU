import tgpu, {
  type TgpuBindGroup,
  type TgpuComputeFn,
  type TgpuFragmentFn,
} from 'typegpu';
import * as d from 'typegpu/data';
import * as p from './params.ts';
import {
  fragmentImageFn,
  fragmentInkFn,
  fragmentVelFn,
  renderFn,
  renderLayout,
} from './render.ts';
import * as c from './simulation.ts';
import {
  type BrushState,
  type DisplayMode,
  floatSampledTexture,
  writeonlyF16Texture,
} from './types.ts';

// Initialize
const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('No GPU adapter found');
}
const root = await tgpu.init();
const device = root.device;

// Setup canvas
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const format = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format,
  alphaMode: 'premultiplied',
});

// Helpers
function createField(name: string) {
  return root['~unstable']
    .createTexture({ size: [p.SIM_N, p.SIM_N], format: 'rgba16float' })
    .$usage('storage', 'sampled')
    .$name(name);
}

function createComputePipeline(fn: TgpuComputeFn) {
  return root['~unstable'].withCompute(fn).createPipeline();
}

function toGrid(x: number, y: number): [number, number] {
  const gx = Math.floor((x / canvas.width) * p.SIM_N);
  const gy = Math.floor(((canvas.height - y) / canvas.height) * p.SIM_N);
  return [gx, gy];
}

class DoubleBuffer<T> {
  buffers: [T, T];
  index: number;
  constructor(bufferA: T, bufferB: T, initialIndex = 0) {
    this.buffers = [bufferA, bufferB];
    this.index = initialIndex;
  }

  get current(): T {
    return this.buffers[this.index];
  }
  get currentIndex(): number {
    return this.index;
  }

  swap(): void {
    this.index ^= 1;
  }
  setCurrent(index: number): void {
    this.index = index;
  }
}

// Buffers and brush state
const simParamBuffer = root
  .createBuffer(p.ShaderParams, {
    dt: p.params.dt,
    viscosity: p.params.viscosity,
  })
  .$usage('uniform');

const brushParamBuffer = root
  .createBuffer(p.BrushParams, {
    pos: d.vec2i(0, 0),
    delta: d.vec2f(0, 0),
    radius: p.RADIUS,
    forceScale: p.FORCE_SCALE,
    inkAmount: p.INK_AMOUNT,
  })
  .$usage('uniform');

let brushState: BrushState = {
  pos: [0, 0],
  delta: [0, 0],
  isDown: false,
};

// Load and create background texture
const response = await fetch('/TypeGPU/plums.jpg');
const plums = await createImageBitmap(await response.blob(), {
  resizeWidth: p.N,
  resizeHeight: p.N,
  resizeQuality: 'high',
});

const backgroundTexture = root['~unstable']
  .createTexture({ size: [p.N, p.N], format: 'rgba8unorm' })
  .$usage('sampled', 'render');
device.queue.copyExternalImageToTexture(
  { source: plums },
  { texture: root.unwrap(backgroundTexture) },
  { width: p.N, height: p.N, depthOrArrayLayers: 1 },
);

// Create simulation textures
const velTex = [createField('velocity0'), createField('velocity1')];
const inkTex = [createField('density0'), createField('density1')];
const pressureTex = [createField('pressure0'), createField('pressure1')];

const newInkTex = createField('addedInk');
const forceTex = createField('force');
const divergenceTex = createField('divergence');

const linSampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
});

// Create compute pipelines
const brushPipeline = createComputePipeline(c.brushFn);
const addForcePipeline = createComputePipeline(c.addForcesFn);
const advectPipeline = createComputePipeline(c.advectFn);
const diffusionPipeline = createComputePipeline(c.diffusionFn);
const divergencePipeline = createComputePipeline(c.divergenceFn);
const pressurePipeline = createComputePipeline(c.pressureFn);
const projectPipeline = createComputePipeline(c.projectFn);
const advectInkPipeline = createComputePipeline(c.advectInkFn);
const addInkPipeline = createComputePipeline(c.addInkFn);

// Create render pipelines
function createRenderPipeline(
  fragmentFn: TgpuFragmentFn<{ uv: d.Vec2f }, d.Vec4f>,
) {
  return root['~unstable']
    .withVertex(renderFn, {})
    .withFragment(fragmentFn, { format })
    .withPrimitive({
      topology: 'triangle-strip',
    })
    .createPipeline();
}

const renderPipelineInk = createRenderPipeline(fragmentInkFn);
const renderPipelineVel = createRenderPipeline(fragmentVelFn);
const renderPipelineImage = createRenderPipeline(fragmentImageFn);

// Setup simulation buffers
const velBuffer = new DoubleBuffer(velTex[0], velTex[1]);
const inkBuffer = new DoubleBuffer(inkTex[0], inkTex[1]);
const pressureBuffer = new DoubleBuffer(pressureTex[0], pressureTex[1]);

const dispatchX = Math.ceil(p.SIM_N / p.WORKGROUP_SIZE_X);
const dispatchY = Math.ceil(p.SIM_N / p.WORKGROUP_SIZE_Y);

// Create bind groups
const brushBindGroup = root.createBindGroup(c.brushLayout, {
  brushParams: brushParamBuffer,
  forceDst: forceTex.createView(writeonlyF16Texture),
  inkDst: newInkTex.createView(writeonlyF16Texture),
});

const addInkBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return root.createBindGroup(c.addInkLayout, {
    src: inkTex[srcIdx].createView(floatSampledTexture),
    add: newInkTex.createView(floatSampledTexture),
    dst: inkTex[dstIdx].createView(writeonlyF16Texture),
  });
});

const addForceBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return root.createBindGroup(c.addForcesLayout, {
    src: velTex[srcIdx].createView(floatSampledTexture),
    force: forceTex.createView(floatSampledTexture),
    dst: velTex[dstIdx].createView(writeonlyF16Texture),
    simParams: simParamBuffer,
  });
});

const advectBindGroups = [0, 1].map((i) => {
  const srcIdx = 1 - i;
  const dstIdx = i;
  return root.createBindGroup(c.advectLayout, {
    src: velTex[srcIdx].createView(floatSampledTexture),
    dst: velTex[dstIdx].createView(writeonlyF16Texture),
    simParams: simParamBuffer,
    linSampler,
  });
});

const diffusionBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return root.createBindGroup(c.diffusionLayout, {
    in: velTex[srcIdx].createView(floatSampledTexture),
    out: velTex[dstIdx].createView(writeonlyF16Texture),
    simParams: simParamBuffer,
  });
});

const divergenceBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  return root.createBindGroup(c.divergenceLayout, {
    vel: velTex[srcIdx].createView(floatSampledTexture),
    div: divergenceTex.createView(writeonlyF16Texture),
  });
});

const pressureBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return root.createBindGroup(c.pressureLayout, {
    x: pressureTex[srcIdx].createView(floatSampledTexture),
    b: divergenceTex.createView(floatSampledTexture),
    out: pressureTex[dstIdx].createView(writeonlyF16Texture),
  });
});

const projectBindGroups = [0, 1].map((velIdx) =>
  [0, 1].map((pIdx) => {
    const srcVelIdx = velIdx;
    const dstVelIdx = 1 - velIdx;
    const srcPIdx = pIdx;
    return root.createBindGroup(c.projectLayout, {
      vel: velTex[srcVelIdx].createView(floatSampledTexture),
      p: pressureTex[srcPIdx].createView(floatSampledTexture),
      out: velTex[dstVelIdx].createView(writeonlyF16Texture),
    });
  })
);

const advectInkBindGroups = [0, 1].map((velIdx) =>
  [0, 1].map((inkIdx) => {
    const srcVelIdx = velIdx;
    const srcInkIdx = inkIdx;
    const dstInkIdx = 1 - inkIdx;
    return root.createBindGroup(c.advectInkLayout, {
      vel: velTex[srcVelIdx].createView(floatSampledTexture),
      src: inkTex[srcInkIdx].createView(floatSampledTexture),
      dst: inkTex[dstInkIdx].createView(writeonlyF16Texture),
      simParams: simParamBuffer,
      linSampler,
    });
  })
);

const renderBindGroups = {
  ink: [
    root.createBindGroup(renderLayout, {
      result: inkTex[0].createView(floatSampledTexture),
      background: backgroundTexture.createView(floatSampledTexture),
      linSampler,
    }),
    root.createBindGroup(renderLayout, {
      result: inkTex[1].createView(floatSampledTexture),
      background: backgroundTexture.createView(floatSampledTexture),
      linSampler,
    }),
  ],
  velocity: [
    root.createBindGroup(renderLayout, {
      result: velTex[0].createView(floatSampledTexture),
      background: backgroundTexture.createView(floatSampledTexture),
      linSampler,
    }),
    root.createBindGroup(renderLayout, {
      result: velTex[1].createView(floatSampledTexture),
      background: backgroundTexture.createView(floatSampledTexture),
      linSampler,
    }),
  ],
};

// Main rendering loop
function loop() {
  if (p.params.paused) {
    requestAnimationFrame(loop);
    return;
  }

  if (brushState.isDown) {
    brushParamBuffer.writePartial({
      pos: d.vec2i(...brushState.pos),
      delta: d.vec2f(...brushState.delta),
    });

    brushPipeline
      .with(c.brushLayout, brushBindGroup)
      .dispatchWorkgroups(dispatchX, dispatchY);

    addInkPipeline
      .with(c.addInkLayout, addInkBindGroups[inkBuffer.currentIndex])
      .dispatchWorkgroups(dispatchX, dispatchY);
    inkBuffer.swap();

    addForcePipeline
      .with(c.addForcesLayout, addForceBindGroups[velBuffer.currentIndex])
      .dispatchWorkgroups(dispatchX, dispatchY);
  } else {
    velBuffer.setCurrent(0);
  }

  advectPipeline
    .with(c.advectLayout, advectBindGroups[velBuffer.currentIndex])
    .dispatchWorkgroups(dispatchX, dispatchY);

  for (let i = 0; i < p.params.jacobiIter; i++) {
    diffusionPipeline
      .with(c.diffusionLayout, diffusionBindGroups[velBuffer.currentIndex])
      .dispatchWorkgroups(dispatchX, dispatchY);
    velBuffer.swap();
  }

  divergencePipeline
    .with(c.divergenceLayout, divergenceBindGroups[velBuffer.currentIndex])
    .dispatchWorkgroups(dispatchX, dispatchY);

  pressureBuffer.setCurrent(0);
  for (let i = 0; i < p.params.jacobiIter; i++) {
    pressurePipeline
      .with(c.pressureLayout, pressureBindGroups[pressureBuffer.currentIndex])
      .dispatchWorkgroups(dispatchX, dispatchY);
    pressureBuffer.swap();
  }

  projectPipeline
    .with(
      c.projectLayout,
      projectBindGroups[velBuffer.currentIndex][pressureBuffer.currentIndex],
    )
    .dispatchWorkgroups(dispatchX, dispatchY);
  velBuffer.swap();

  advectInkPipeline
    .with(
      c.advectInkLayout,
      advectInkBindGroups[velBuffer.currentIndex][inkBuffer.currentIndex],
    )
    .dispatchWorkgroups(dispatchX, dispatchY);
  inkBuffer.swap();

  let renderBG: TgpuBindGroup<{
    result: { texture: d.WgslSampledTexture<'2d', 'float'> };
    background: { texture: d.WgslSampledTexture<'2d', 'float'> };
  }>;
  let pipeline:
    | typeof renderPipelineInk
    | typeof renderPipelineVel
    | typeof renderPipelineImage;

  switch (p.params.displayMode) {
    case 'ink':
      renderBG = renderBindGroups.ink[inkBuffer.currentIndex];
      pipeline = renderPipelineInk;
      break;
    case 'image':
      renderBG = renderBindGroups.ink[inkBuffer.currentIndex];
      pipeline = renderPipelineImage;
      break;
    case 'velocity':
      renderBG = renderBindGroups.velocity[velBuffer.currentIndex];
      pipeline = renderPipelineVel;
      break;
    default:
      throw new Error('Invalid display mode');
  }

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(renderLayout, renderBG)
    .draw(3);

  requestAnimationFrame(loop);
}

loop();

// #region Example controls and cleanup

canvas.addEventListener('mousedown', (e) => {
  const x = e.offsetX * devicePixelRatio;
  const y = e.offsetY * devicePixelRatio;
  brushState = {
    pos: toGrid(x, y),
    delta: [0, 0],
    isDown: true,
  };
});
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) * devicePixelRatio;
  const y = (touch.clientY - rect.top) * devicePixelRatio;
  brushState = {
    pos: toGrid(x, y),
    delta: [0, 0],
    isDown: true,
  };
}, { passive: false });

window.addEventListener('mouseup', () => {
  brushState.isDown = false;
});
window.addEventListener('touchend', () => {
  brushState.isDown = false;
});

canvas.addEventListener('mousemove', (e) => {
  const x = e.offsetX * devicePixelRatio;
  const y = e.offsetY * devicePixelRatio;
  const [newX, newY] = toGrid(x, y);
  brushState.delta = [newX - brushState.pos[0], newY - brushState.pos[1]];
  brushState.pos = [newX, newY];
});
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const touch = e.touches[0];
  const rect = canvas.getBoundingClientRect();
  const x = (touch.clientX - rect.left) * devicePixelRatio;
  const y = (touch.clientY - rect.top) * devicePixelRatio;
  const [newX, newY] = toGrid(x, y);
  brushState.delta = [newX - brushState.pos[0], newY - brushState.pos[1]];
  brushState.pos = [newX, newY];
}, { passive: false });

function hideHelp() {
  const helpElem = document.getElementById('help');
  if (helpElem) {
    helpElem.style.opacity = '0';
  }
}
for (const eventName of ['click', 'touchstart']) {
  window.addEventListener(eventName, hideHelp, { once: true });
}

export const controls = {
  'timestep (dt)': {
    initial: p.params.dt,
    min: 0.05,
    max: 2.0,
    step: 0.01,
    onSliderChange: (value: number) => {
      p.params.dt = value;
      simParamBuffer.writePartial({
        dt: p.params.dt,
      });
    },
  },
  viscosity: {
    initial: p.params.viscosity,
    min: 0,
    max: 0.1,
    step: 0.000001,
    onSliderChange: (value: number) => {
      p.params.viscosity = value;
      simParamBuffer.writePartial({
        viscosity: p.params.viscosity,
      });
    },
  },
  'jacobi iterations': {
    initial: p.params.jacobiIter,
    min: 2,
    max: 50,
    step: 2,
    onSliderChange: (value: number) => {
      p.params.jacobiIter = value;
    },
  },
  visualization: {
    initial: 'image',
    options: ['image', 'velocity', 'ink'],
    onSelectChange: (value: DisplayMode) => {
      p.params.displayMode = value;
    },
  },
  pause: {
    initial: false,
    onToggleChange: (value: boolean) => {
      p.params.paused = value;
    },
  },
};

export function onCleanup() {
  root.destroy();
  root.device.destroy();
}

// #endregion
