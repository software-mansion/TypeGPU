import tgpu, { type TgpuBindGroup } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) {
  throw new Error('No GPU adapter found');
}
const device = await adapter.requestDevice({
  requiredFeatures: ['float32-filterable'],
});
const root = tgpu.initFromDevice({ device });

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const format = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: format,
  alphaMode: 'premultiplied',
});
const N = 2048; // Display resolution
const SIM_N = N / 4; // Simulation resolution
const [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y] = [16, 16];

const params = {
  dt: 0.3,
  viscosity: 0.000001,
  jacobiIter: 10,
  showField: 'ink' as 'ink' | 'velocity' | 'image',
  boundary: true,
};

const Params = d.struct({
  dt: d.f32,
  viscosity: d.f32,
});
const simParamBuffer = root
  .createBuffer(Params, {
    dt: params.dt,
    viscosity: params.viscosity,
  })
  .$usage('uniform');

const FORCE_SCALE = 1;
const RADIUS = SIM_N / 32;
const INK_AMOUNT = 0.05;

const BrushParams = d.struct({
  pos: d.vec2i,
  delta: d.vec2f,
  radius: d.f32,
  forceScale: d.f32,
  inkAmount: d.f32,
  isDown: d.u32,
});

const brushParamBuffer = root
  .createBuffer(BrushParams, {
    pos: d.vec2i(0, 0),
    delta: d.vec2f(0, 0),
    radius: RADIUS,
    forceScale: FORCE_SCALE,
    inkAmount: INK_AMOUNT,
    isDown: 0,
  })
  .$usage('uniform');

let isMouseDown = false;
let lastMousePos: [number, number] = [0, 0];
let mouseDelta: [number, number] = [0, 0];
let prevBrushState = {
  pos: [0, 0],
  delta: [0, 0],
  isDown: 0,
};

canvas.addEventListener('mousedown', (e) => {
  isMouseDown = true;
  lastMousePos = [e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio];
});
canvas.addEventListener('mouseup', () => {
  isMouseDown = false;
});
canvas.addEventListener('mousemove', (e) => {
  if (isMouseDown) {
    const dx = e.offsetX * devicePixelRatio - lastMousePos[0];
    const dy = e.offsetY * devicePixelRatio - lastMousePos[1];
    mouseDelta[0] += dx;
    mouseDelta[1] += dy;
    lastMousePos = [e.offsetX * devicePixelRatio, e.offsetY * devicePixelRatio];
  }
});

function createField(format: 'rg32float' | 'r32float', name: string) {
  return root['~unstable']
    .createTexture({ size: [SIM_N, SIM_N], format })
    .$usage('storage', 'sampled') // Ensure storage usage for brush kernel
    .$name(name);
}

const response = await fetch('/TypeGPU/plums.jpg');
const plums = await createImageBitmap(await response.blob(), {
  resizeWidth: N,
  resizeHeight: N,
  resizeQuality: 'high',
});

const backgroundTexture = root['~unstable']
  .createTexture({ size: [N, N], format: 'rgba8unorm' })
  .$usage('sampled', 'render')
  .$name('background');
device.queue.copyExternalImageToTexture(
  { source: plums },
  { texture: root.unwrap(backgroundTexture) },
  { width: N, height: N, depthOrArrayLayers: 1 },
);

const velTex = [
  createField('rg32float', 'velocity0'),
  createField('rg32float', 'velocity1'),
];
const inkTex = [
  createField('r32float', 'density0'),
  createField('r32float', 'density1'),
];
const pressureTex = [
  createField('r32float', 'pressure0'),
  createField('r32float', 'pressure1'),
];

const newInkTex = createField('r32float', 'addedInk');
const forceTex = createField('rg32float', 'force');
const divergenceTex = createField('r32float', 'divergence');

const linSampler = tgpu['~unstable'].sampler({
  magFilter: 'linear',
  minFilter: 'linear',
  addressModeU: 'clamp-to-edge',
  addressModeV: 'clamp-to-edge',
});

const brushLayout = tgpu.bindGroupLayout({
  brushParams: { uniform: BrushParams },
  forceDst: { storageTexture: 'rg32float', access: 'writeonly' },
  inkDst: { storageTexture: 'r32float', access: 'writeonly' },
});

const brushFn = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = input.gid.xy;
  const params = brushLayout.$.brushParams;

  let force = d.vec2f(0.0);
  let ink = d.f32(0.0);

  if (params.isDown === 1) {
    const dx = d.f32(coords.x) - d.f32(params.pos.x);
    const dy = d.f32(coords.y) - d.f32(params.pos.y);
    const distSq = dx * dx + dy * dy;
    const radiusSq = params.radius * params.radius;

    if (distSq < radiusSq) {
      const weight = std.exp(-distSq / radiusSq);
      force = std.mul(params.forceScale * weight, params.delta);
      ink = params.inkAmount * weight;
    }
  }

  std.textureStore(brushLayout.$.forceDst, coords, d.vec4f(force, 0.0, 1.0));
  std.textureStore(brushLayout.$.inkDst, coords, d.vec4f(ink, 0.0, 0.0, 1.0));
});

const brushPipeline = root['~unstable'].withCompute(brushFn).createPipeline();

const addForcesLayout = tgpu.bindGroupLayout({
  src: { texture: 'float' },
  dst: { storageTexture: 'rg32float', access: 'writeonly' },
  force: { texture: 'float' },
  simParams: { uniform: Params },
});

const addForcesFn = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = input.gid.xy;
  const u = std.textureLoad(addForcesLayout.$.src, coords, 0).xy;
  const f = std.textureLoad(addForcesLayout.$.force, coords, 0).xy;
  const dt = addForcesLayout.$.simParams.dt;
  const u2 = std.add(u, std.mul(dt, f));
  std.textureStore(addForcesLayout.$.dst, coords, d.vec4f(u2, 0, 1));
});

const addForcePipeline = root['~unstable']
  .withCompute(addForcesFn)
  .createPipeline();

// Advect the velocity field using itself (semi-Lagrangian advection).
const advectLayout = tgpu.bindGroupLayout({
  src: { texture: 'float' },
  dst: { storageTexture: 'rg32float', access: 'writeonly' },
  simParams: { uniform: Params },
});

const advectFn = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const textureDimensions = std.textureDimensions(advectLayout.$.src);
  const coords = input.gid.xy;
  const oldVel = std.textureLoad(advectLayout.$.src, coords, 0);
  const dt = advectLayout.$.simParams.dt;
  const oldCoords = std.sub(d.vec2f(coords), std.mul(dt, oldVel.xy));
  const oldCoordsClamped = std.clamp(
    oldCoords,
    d.vec2f(-0.5),
    d.vec2f(std.sub(d.vec2f(textureDimensions.xy), d.vec2f(0.5))),
  );
  const oldCoordsNormalized = std.div(
    std.add(oldCoordsClamped, d.vec2f(0.5)),
    d.vec2f(textureDimensions.xy),
  );

  const velAtOldCoords = std.textureSampleLevel(
    advectLayout.$.src,
    linSampler,
    oldCoordsNormalized,
    0,
  );

  std.textureStore(advectLayout.$.dst, coords, velAtOldCoords);
});

const advectPipeline = root['~unstable'].withCompute(advectFn).createPipeline();

// Jacobi diffusion step on the velocity field.
const diffusionLayout = tgpu.bindGroupLayout({
  in: { texture: 'float' },
  out: { storageTexture: 'rg32float', access: 'writeonly' },
  simParams: { uniform: Params },
});

const getNeighbors = tgpu['~unstable'].fn(
  { coords: d.vec2i, bounds: d.vec2i },
  d.arrayOf(d.vec2i, 4),
)(({ coords, bounds }) => {
  const res = [d.vec2i(-1, 0), d.vec2i(0, -1), d.vec2i(1, 0), d.vec2i(0, 1)];
  for (let i = 0; i < 4; i++) {
    res[i] = std.clamp(
      std.add(coords, res[i]),
      d.vec2i(0),
      std.sub(bounds, d.vec2i(1)),
    );
  }
  return res;
});

const diffusionFn = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = d.vec2i(input.gid.xy);
  const textureDimensions = d.vec2i(
    std.textureDimensions(diffusionLayout.$.in),
  );
  const inputValue = std.textureLoad(diffusionLayout.$.in, coords, 0);

  const neighbors = getNeighbors({ coords, bounds: textureDimensions });

  const left = std.textureLoad(diffusionLayout.$.in, neighbors[0], 0);
  const up = std.textureLoad(diffusionLayout.$.in, neighbors[1], 0);
  const right = std.textureLoad(diffusionLayout.$.in, neighbors[2], 0);
  const down = std.textureLoad(diffusionLayout.$.in, neighbors[3], 0);

  const dt = diffusionLayout.$.simParams.dt;
  const viscosity = diffusionLayout.$.simParams.viscosity;

  const alpha = viscosity * dt;
  const beta = 1.0 / (4.0 + alpha);
  const newValue = std.mul(
    d.vec4f(beta),
    std.add(
      std.add(std.add(left, right), std.add(up, down)),
      std.mul(d.f32(alpha), inputValue),
    ),
  );

  std.textureStore(diffusionLayout.$.out, coords, newValue);
});

const diffusionPipeline = root['~unstable']
  .withCompute(diffusionFn)
  .createPipeline();

// Compute the divergence of the velocity field.
const divergenceLayout = tgpu.bindGroupLayout({
  vel: { texture: 'float' },
  div: { storageTexture: 'r32float', access: 'writeonly' },
});

const divergenceFn = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = d.vec2i(input.gid.xy);
  const textureDimensions = d.vec2i(
    std.textureDimensions(divergenceLayout.$.vel),
  );

  const neighbors = getNeighbors({ coords, bounds: textureDimensions });

  const left = std.textureLoad(divergenceLayout.$.vel, neighbors[0], 0);
  const up = std.textureLoad(divergenceLayout.$.vel, neighbors[1], 0);
  const right = std.textureLoad(divergenceLayout.$.vel, neighbors[2], 0);
  const down = std.textureLoad(divergenceLayout.$.vel, neighbors[3], 0);

  const div = d.f32(0.5) * (right.x - left.x + (down.y - up.y));
  std.textureStore(divergenceLayout.$.div, coords, d.vec4f(div, 0, 0, 1));
});

const divergencePipeline = root['~unstable']
  .withCompute(divergenceFn)
  .createPipeline();

// Jacobi iteration step to solve for pressure field.
const pressureLayout = tgpu.bindGroupLayout({
  x: { texture: 'float' },
  b: { texture: 'float' },
  out: { storageTexture: 'r32float', access: 'writeonly' },
});

const pressureFn = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = d.vec2i(input.gid.xy);
  const textureDimensions = d.vec2i(std.textureDimensions(pressureLayout.$.x));

  const neighbors = getNeighbors({ coords, bounds: textureDimensions });

  const left = std.textureLoad(pressureLayout.$.x, neighbors[0], 0);
  const up = std.textureLoad(pressureLayout.$.x, neighbors[1], 0);
  const right = std.textureLoad(pressureLayout.$.x, neighbors[2], 0);
  const down = std.textureLoad(pressureLayout.$.x, neighbors[3], 0);

  const div = std.textureLoad(pressureLayout.$.b, coords, 0).x;
  const newP = d.f32(0.25) * (left.x + right.x + up.x + down.x - div);
  std.textureStore(pressureLayout.$.out, coords, d.vec4f(newP, 0, 0, 1));
});

const pressurePipeline = root['~unstable']
  .withCompute(pressureFn)
  .createPipeline();

// Subtract pressure gradient from velocity field for incompressibility.
const projectLayout = tgpu.bindGroupLayout({
  vel: { texture: 'float' },
  p: { texture: 'float' },
  out: { storageTexture: 'rg32float', access: 'writeonly' },
});

const projectFn = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const coords = d.vec2i(input.gid.xy);
  const textureDimensions = d.vec2i(std.textureDimensions(projectLayout.$.vel));
  const vel = std.textureLoad(projectLayout.$.vel, coords, 0);

  const neighbors = getNeighbors({ coords, bounds: textureDimensions });

  const left = std.textureLoad(projectLayout.$.p, neighbors[0], 0);
  const up = std.textureLoad(projectLayout.$.p, neighbors[1], 0);
  const right = std.textureLoad(projectLayout.$.p, neighbors[2], 0);
  const down = std.textureLoad(projectLayout.$.p, neighbors[3], 0);

  const grad = d.vec2f(0.5 * (right.x - left.x), 0.5 * (down.x - up.x));
  const newVel = std.sub(vel.xy, grad);
  std.textureStore(projectLayout.$.out, coords, d.vec4f(newVel, 0, 1));
});

const projectPipeline = root['~unstable']
  .withCompute(projectFn)
  .createPipeline();

// Advect scalar (ink) field using velocity field.
const advectInkLayout = tgpu.bindGroupLayout({
  vel: { texture: 'float' },
  src: { texture: 'float' },
  dst: { storageTexture: 'r32float', access: 'writeonly' },
  simParams: { uniform: Params },
});

const advectScalarFn = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const dims = std.textureDimensions(advectInkLayout.$.src);
  const coords = input.gid.xy;

  const vel = std.textureLoad(advectInkLayout.$.vel, coords, 0).xy;
  const dt = advectInkLayout.$.simParams.dt;
  const oldCoords = std.sub(d.vec2f(coords), std.mul(dt, vel));
  const clamped = std.clamp(
    oldCoords,
    d.vec2f(-0.5),
    std.sub(d.vec2f(dims.xy), d.vec2f(0.5)),
  );
  const uv = std.div(std.add(clamped, d.vec2f(0.5)), d.vec2f(dims.xy));

  const ink = std.textureSampleLevel(advectInkLayout.$.src, linSampler, uv, 0);
  std.textureStore(advectInkLayout.$.dst, coords, ink);
});

const advectInkPipeline = root['~unstable']
  .withCompute(advectScalarFn)
  .createPipeline();

// Add new ink to the scalar (ink) field.
const addInkLayout = tgpu.bindGroupLayout({
  src: { texture: 'float' },
  dst: { storageTexture: 'r32float', access: 'writeonly' },
  add: { texture: 'float' },
});

const addInkFn = tgpu['~unstable'].computeFn({
  workgroupSize: [WORKGROUP_SIZE_X, WORKGROUP_SIZE_Y],
  in: { gid: d.builtin.globalInvocationId },
})((input) => {
  const c = input.gid.xy;
  const a = std.textureLoad(addInkLayout.$.add, c, 0).x;
  const s = std.textureLoad(addInkLayout.$.src, c, 0).x;
  std.textureStore(addInkLayout.$.dst, c, d.vec4f(a + s, 0, 0, 1));
});

const addInkPipeline = root['~unstable'].withCompute(addInkFn).createPipeline();

// Rendering
const renderLayout = tgpu.bindGroupLayout({
  result: { texture: 'float' },
  background: { texture: 'float' },
});

const renderFn = tgpu['~unstable'].vertexFn({
  in: { idx: d.builtin.vertexIndex },
  out: { pos: d.builtin.position, uv: d.vec2f },
})((i) => {
  const verts = [
    d.vec4f(-1, -1, 0, 1),
    d.vec4f(1, -1, 0, 1),
    d.vec4f(-1, 1, 0, 1),
    d.vec4f(1, -1, 0, 1),
    d.vec4f(1, 1, 0, 1),
    d.vec4f(-1, 1, 0, 1),
  ];
  const uvs = [
    d.vec2f(0, 0),
    d.vec2f(1, 0),
    d.vec2f(0, 1),
    d.vec2f(1, 0),
    d.vec2f(1, 1),
    d.vec2f(0, 1),
  ];
  return { pos: verts[i.idx], uv: uvs[i.idx] };
});

const fragmentInkFn = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((inp) => {
  const dens = std.textureSample(renderLayout.$.result, linSampler, inp.uv).x;
  return d.vec4f(dens, dens * 0.8, dens * 0.5, d.f32(1.0));
});

const fragmentVelFn = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((inp) => {
  const f = std.textureSample(renderLayout.$.result, linSampler, inp.uv).xy;
  const mag = std.length(f);
  const col = d.vec4f(
    (f.x + 1.0) * 0.5, // x->r
    (f.y + 1.0) * 0.5, // y->g
    mag * 0.4,
    d.f32(1.0),
  );
  return col;
});

const fragmentImageFn = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((inp) => {
  const EPS = d.f32(0.5) / SIM_N;

  const left = std.textureSample(
    renderLayout.$.result,
    linSampler,
    d.vec2f(inp.uv.x - EPS, inp.uv.y),
  ).x;
  const right = std.textureSample(
    renderLayout.$.result,
    linSampler,
    d.vec2f(inp.uv.x + EPS, inp.uv.y),
  ).x;
  const up = std.textureSample(
    renderLayout.$.result,
    linSampler,
    d.vec2f(inp.uv.x, inp.uv.y + EPS),
  ).x;
  const down = std.textureSample(
    renderLayout.$.result,
    linSampler,
    d.vec2f(inp.uv.x, inp.uv.y - EPS),
  ).x;

  const dx = right - left;
  const dy = up - down;

  const strength = 0.8;
  const displacement = d.vec2f(dx, dy);
  const offsetUV = std.add(
    inp.uv,
    std.mul(displacement, d.vec2f(strength, -strength)),
  );

  const color = std.textureSample(
    renderLayout.$.background,
    linSampler,
    d.vec2f(offsetUV.x, 1.0 - offsetUV.y),
  );

  return d.vec4f(color.xyz, 1.0);
});

const renderPipelineInk = root['~unstable']
  .withVertex(renderFn, renderFn.shell.attributes)
  .withFragment(fragmentInkFn, { format })
  .createPipeline();

const renderPipelineVel = root['~unstable']
  .withVertex(renderFn, renderFn.shell.attributes)
  .withFragment(fragmentVelFn, { format })
  .createPipeline();

const renderPipelineImage = root['~unstable']
  .withVertex(renderFn, renderFn.shell.attributes)
  .withFragment(fragmentImageFn, { format })
  .createPipeline();

function toGrid(x: number, y: number) {
  const gx = Math.floor((x / canvas.width) * SIM_N);
  const gy = Math.floor(((canvas.height - y) / canvas.height) * SIM_N);
  return [gx, gy] as const;
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
  get next(): T {
    return this.buffers[1 - this.index];
  }
  get currentIndex(): number {
    return this.index;
  }

  swap(): void {
    this.index = 1 - this.index;
  }
  setCurrent(index: number): void {
    this.index = index;
  }
}

const velBuffer = new DoubleBuffer(velTex[0], velTex[1]);
const inkBuffer = new DoubleBuffer(inkTex[0], inkTex[1]);
const pressureBuffer = new DoubleBuffer(pressureTex[0], pressureTex[1]);

let renderField: 'ink' | 'velocity' | 'image' = params.showField;
let paused = false;

const dispatchX = Math.ceil(SIM_N / WORKGROUP_SIZE_X);
const dispatchY = Math.ceil(SIM_N / WORKGROUP_SIZE_Y);

const brushBindGroup = root.createBindGroup(brushLayout, {
  brushParams: brushParamBuffer,
  forceDst: forceTex.createView('writeonly'),
  inkDst: newInkTex.createView('writeonly'),
});

const addInkBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return root.createBindGroup(addInkLayout, {
    src: inkTex[srcIdx].createView('sampled'),
    add: newInkTex.createView('sampled'),
    dst: inkTex[dstIdx].createView('writeonly'),
  });
});

const addForceBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return root.createBindGroup(addForcesLayout, {
    src: velTex[srcIdx].createView('sampled'),
    force: forceTex.createView('sampled'),
    dst: velTex[dstIdx].createView('writeonly'),
    simParams: simParamBuffer,
  });
});

const advectBindGroups = [0, 1].map((i) => {
  const srcIdx = 1 - i;
  const dstIdx = i;
  return root.createBindGroup(advectLayout, {
    src: velTex[srcIdx].createView('sampled'),
    dst: velTex[dstIdx].createView('writeonly'),
    simParams: simParamBuffer,
  });
});

const diffusionBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return root.createBindGroup(diffusionLayout, {
    in: velTex[srcIdx].createView('sampled'),
    out: velTex[dstIdx].createView('writeonly'),
    simParams: simParamBuffer,
  });
});

const divergenceBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  return root.createBindGroup(divergenceLayout, {
    vel: velTex[srcIdx].createView('sampled'),
    div: divergenceTex.createView('writeonly'),
  });
});

const pressureBindGroups = [0, 1].map((i) => {
  const srcIdx = i;
  const dstIdx = 1 - i;
  return root.createBindGroup(pressureLayout, {
    x: pressureTex[srcIdx].createView('sampled'),
    b: divergenceTex.createView('sampled'),
    out: pressureTex[dstIdx].createView('writeonly'),
  });
});

const projectBindGroups = [0, 1].map((velIdx) =>
  [0, 1].map((pIdx) => {
    const srcVelIdx = velIdx;
    const dstVelIdx = 1 - velIdx;
    const srcPIdx = pIdx;
    return root.createBindGroup(projectLayout, {
      vel: velTex[srcVelIdx].createView('sampled'),
      p: pressureTex[srcPIdx].createView('sampled'),
      out: velTex[dstVelIdx].createView('writeonly'),
    });
  }),
);

const advectInkBindGroups = [0, 1].map((velIdx) =>
  [0, 1].map((inkIdx) => {
    const srcVelIdx = velIdx;
    const srcInkIdx = inkIdx;
    const dstInkIdx = 1 - inkIdx;
    return root.createBindGroup(advectInkLayout, {
      vel: velTex[srcVelIdx].createView('sampled'),
      src: inkTex[srcInkIdx].createView('sampled'),
      dst: inkTex[dstInkIdx].createView('writeonly'),
      simParams: simParamBuffer,
    });
  }),
);

const renderBindGroups = {
  ink: [
    root.createBindGroup(renderLayout, {
      result: inkTex[0].createView('sampled'),
      background: backgroundTexture.createView('sampled'),
    }),
    root.createBindGroup(renderLayout, {
      result: inkTex[1].createView('sampled'),
      background: backgroundTexture.createView('sampled'),
    }),
  ],
  velocity: [
    root.createBindGroup(renderLayout, {
      result: velTex[0].createView('sampled'),
      background: backgroundTexture.createView('sampled'),
    }),
    root.createBindGroup(renderLayout, {
      result: velTex[1].createView('sampled'),
      background: backgroundTexture.createView('sampled'),
    }),
  ],
};

function loop() {
  if (paused) {
    requestAnimationFrame(loop);
    return;
  }

  const [gx, gy] = toGrid(lastMousePos[0], lastMousePos[1]);
  const curBrushState = {
    pos: [gx, gy] as [number, number],
    delta: [mouseDelta[0], -mouseDelta[1]] as [number, number],
    isDown: isMouseDown ? 1 : 0,
  };

  if (
    curBrushState.pos[0] !== prevBrushState.pos[0] ||
    curBrushState.pos[1] !== prevBrushState.pos[1] ||
    curBrushState.delta[0] !== prevBrushState.delta[0] ||
    curBrushState.delta[1] !== prevBrushState.delta[1] ||
    curBrushState.isDown !== prevBrushState.isDown
  ) {
    brushParamBuffer.writePartial({
      pos: d.vec2i(...curBrushState.pos),
      delta: d.vec2f(...curBrushState.delta),
      isDown: curBrushState.isDown,
    });
    prevBrushState = { ...curBrushState };
  }
  mouseDelta = [0, 0];

  brushPipeline
    .with(brushLayout, brushBindGroup)
    .dispatchWorkgroups(dispatchX, dispatchY);

  addInkPipeline
    .with(addInkLayout, addInkBindGroups[inkBuffer.currentIndex])
    .dispatchWorkgroups(dispatchX, dispatchY);
  inkBuffer.swap();

  addForcePipeline
    .with(addForcesLayout, addForceBindGroups[velBuffer.currentIndex])
    .dispatchWorkgroups(dispatchX, dispatchY);

  advectPipeline
    .with(advectLayout, advectBindGroups[velBuffer.currentIndex])
    .dispatchWorkgroups(dispatchX, dispatchY);

  for (let i = 0; i < params.jacobiIter; i++) {
    diffusionPipeline
      .with(diffusionLayout, diffusionBindGroups[velBuffer.currentIndex])
      .dispatchWorkgroups(dispatchX, dispatchY);
    velBuffer.swap();
  }

  divergencePipeline
    .with(divergenceLayout, divergenceBindGroups[velBuffer.currentIndex])
    .dispatchWorkgroups(dispatchX, dispatchY);

  pressureBuffer.setCurrent(0);
  for (let i = 0; i < params.jacobiIter; i++) {
    pressurePipeline
      .with(pressureLayout, pressureBindGroups[pressureBuffer.currentIndex])
      .dispatchWorkgroups(dispatchX, dispatchY);
    pressureBuffer.swap();
  }

  projectPipeline
    .with(
      projectLayout,
      projectBindGroups[velBuffer.currentIndex][pressureBuffer.currentIndex],
    )
    .dispatchWorkgroups(dispatchX, dispatchY);
  velBuffer.swap();

  advectInkPipeline
    .with(
      advectInkLayout,
      advectInkBindGroups[velBuffer.currentIndex][inkBuffer.currentIndex],
    )
    .dispatchWorkgroups(dispatchX, dispatchY);
  inkBuffer.swap();

  let renderBG: TgpuBindGroup<{
    result: { texture: 'float' };
    background: { texture: 'float' };
  }>;
  let pipeline:
    | typeof renderPipelineInk
    | typeof renderPipelineVel
    | typeof renderPipelineImage;

  if (renderField === 'ink') {
    renderBG = renderBindGroups.ink[inkBuffer.currentIndex];
    pipeline = renderPipelineInk;
  } else if (renderField === 'image') {
    renderBG = renderBindGroups.ink[inkBuffer.currentIndex];
    pipeline = renderPipelineImage;
  } else {
    renderBG = renderBindGroups.velocity[velBuffer.currentIndex];
    pipeline = renderPipelineVel;
  }

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .with(renderLayout, renderBG)
    .draw(6);

  root['~unstable'].flush();
  requestAnimationFrame(loop);
}

loop();

export const controls = {
  'timestep (dt)': {
    initial: params.dt,
    min: 0.05,
    max: 2.0,
    step: 0.01,
    onSliderChange: (value: number) => {
      params.dt = value;
      simParamBuffer.writePartial({
        dt: params.dt,
      });
    },
  },
  viscosity: {
    initial: params.viscosity,
    min: 0,
    max: 0.1,
    step: 0.000001,
    onSliderChange: (value: number) => {
      params.viscosity = value;
      simParamBuffer.writePartial({
        viscosity: params.viscosity,
      });
    },
  },
  'jacobi iterations': {
    initial: params.jacobiIter,
    min: 2,
    max: 50,
    step: 2,
    onSliderChange: (value: number) => {
      params.jacobiIter = value;
    },
  },
  visualization: {
    initial: 'ink',
    options: ['ink', 'velocity', 'image'],
    onSelectChange: (value: string) => {
      renderField = value as 'ink' | 'velocity' | 'image';
    },
  },
  pause: {
    initial: false,
    onToggleChange: (value: boolean) => {
      paused = value;
    },
  },
};

export function onCleanup() {
  root.destroy();
  root.device.destroy();
}
