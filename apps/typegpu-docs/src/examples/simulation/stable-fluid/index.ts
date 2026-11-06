import { tgpu, common, d, std, type TgpuComputePass, type TgpuComputePipeline } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const SIM_SIZE = 512;
const IMAGE_SIZE = 2048;
const WORKGROUPS = SIM_SIZE / 16;
const BRUSH_RADIUS = 1 / 16;
const INK_AMOUNT = 0.05;
const LIGHT = d.vec3f(-0.4, -0.6, 1);

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const Params = d.struct({
  dt: d.f32,
  diffusion: d.f32,
  inkDecay: d.f32,
  brushFrom: d.vec2f,
  brushTo: d.vec2f,
  brushDown: d.u32,
});

const params = root.createUniform(Params);
const displayMode = root.createUniform(d.u32);

const plums = await (await fetch('/TypeGPU/plums.jpg')).blob();
const backgroundTexture = root
  .createTexture({ size: [IMAGE_SIZE, IMAGE_SIZE], format: 'rgba8unorm', mipLevelCount: 12 })
  .$usage('sampled', 'render');
await backgroundTexture.writeAsync(plums, { size: [IMAGE_SIZE, IMAGE_SIZE], fit: 'stretch' });
backgroundTexture.generateMipmaps();
const background = backgroundTexture.createView(d.texture2d(d.f32));

function createField() {
  return root
    .createTexture({ size: [SIM_SIZE, SIM_SIZE], format: 'rgba16float' })
    .$usage('sampled', 'storage');
}

function createScalarField() {
  return root
    .createTexture({ size: [SIM_SIZE, SIM_SIZE], format: 'r32float' })
    .$usage('storage')
    .createView(d.textureStorage2d('r32float', 'read-write'));
}

const velocityLayout = tgpu.bindGroupLayout({
  velocity: { texture: d.texture2d(d.f32) },
  velocityOut: { storageTexture: d.textureStorage2d('rgba16float') },
});

const inkLayout = tgpu.bindGroupLayout({
  ink: { texture: d.texture2d(d.f32) },
  inkOut: { storageTexture: d.textureStorage2d('rgba16float') },
});

const velocityTextures = [createField(), createField()];
const velocityGroups = [0, 1].map((i) =>
  root.createBindGroup(velocityLayout, {
    velocity: velocityTextures[i],
    velocityOut: velocityTextures[1 - i],
  }),
);

const inkTextures = [createField(), createField()];
const inkGroups = [0, 1].map((i) =>
  root.createBindGroup(inkLayout, { ink: inkTextures[i], inkOut: inkTextures[1 - i] }),
);

const pressure = createScalarField();
const divergence = createScalarField();

const sampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
  mipmapFilter: 'linear',
});

const LEFT = d.vec2i(-1, 0);
const RIGHT = d.vec2i(1, 0);
const UP = d.vec2i(0, -1);
const DOWN = d.vec2i(0, 1);

const clampCell = (cell: d.v2i) => {
  'use gpu';
  return std.clamp(cell, d.vec2i(0), d.vec2i(SIM_SIZE - 1));
};

const loadVelocity = (cell: d.v2i) => {
  'use gpu';
  return std.textureLoad(velocityLayout.$.velocity, clampCell(cell), 0).xy;
};

const loadPressure = (cell: d.v2i) => {
  'use gpu';
  return std.textureLoad(pressure.$, clampCell(cell)).x;
};

const brushWeight = (uv: d.v2f) => {
  'use gpu';
  const offset = (uv - params.$.brushTo) / BRUSH_RADIUS;
  const distanceSquared = std.dot(offset, offset);
  const inside = params.$.brushDown === 1 && distanceSquared < 1;
  return std.select(d.f32(0), std.exp(-distanceSquared), inside);
};

const cellUv = (cell: d.v2u) => {
  'use gpu';
  return (d.vec2f(cell) + 0.5) / SIM_SIZE;
};

const advectVelocity = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x >= SIM_SIZE || gid.y >= SIM_SIZE) {
    return;
  }

  const uv = cellUv(gid.xy);
  const origin = uv - (params.$.dt * loadVelocity(d.vec2i(gid.xy))) / SIM_SIZE;
  const advected = std.textureSampleLevel(velocityLayout.$.velocity, sampler.$, origin, 0).xy;

  const stroke = (params.$.brushTo - params.$.brushFrom) * SIM_SIZE;
  const flow = advected + params.$.dt * brushWeight(uv) * stroke;

  const interior =
    std.all(std.gt(gid.xy, d.vec2u(0))) && std.all(std.lt(gid.xy, d.vec2u(SIM_SIZE - 1)));
  std.textureStore(
    velocityLayout.$.velocityOut,
    gid.xy,
    d.vec4f(std.select(d.vec2f(), flow, interior), 0, 1),
  );
});

const diffuse = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x >= SIM_SIZE || gid.y >= SIM_SIZE) {
    return;
  }

  const cell = d.vec2i(gid.xy);
  const center = loadVelocity(cell);
  const neighbors =
    loadVelocity(cell + LEFT) +
    loadVelocity(cell + RIGHT) +
    loadVelocity(cell + UP) +
    loadVelocity(cell + DOWN);

  const diffused = center + params.$.diffusion * (neighbors - 4 * center);
  std.textureStore(velocityLayout.$.velocityOut, gid.xy, d.vec4f(diffused, 0, 1));
});

const computeDivergence = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x >= SIM_SIZE || gid.y >= SIM_SIZE) {
    return;
  }

  const cell = d.vec2i(gid.xy);
  const horizontal = loadVelocity(cell + RIGHT).x - loadVelocity(cell + LEFT).x;
  const vertical = loadVelocity(cell + DOWN).y - loadVelocity(cell + UP).y;
  std.textureStore(divergence.$, cell, d.vec4f(0.5 * (horizontal + vertical)));
});

const redBlack = tgpu.slot<number>();

const relaxPressure = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x * 2 >= SIM_SIZE || gid.y >= SIM_SIZE) {
    return;
  }

  const cell = d.vec2i(d.vec2u(gid.x * 2 + ((gid.y + redBlack.$) & 1), gid.y));
  const neighbors =
    loadPressure(cell + LEFT) +
    loadPressure(cell + RIGHT) +
    loadPressure(cell + UP) +
    loadPressure(cell + DOWN);

  const divergenceAtCell = std.textureLoad(divergence.$, cell).x;
  std.textureStore(pressure.$, cell, d.vec4f((neighbors - divergenceAtCell) / 4));
});

const project = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x >= SIM_SIZE || gid.y >= SIM_SIZE) {
    return;
  }

  const cell = d.vec2i(gid.xy);
  const gradient = d.vec2f(
    loadPressure(cell + RIGHT) - loadPressure(cell + LEFT),
    loadPressure(cell + DOWN) - loadPressure(cell + UP),
  );
  const projected = loadVelocity(cell) - 0.5 * gradient;
  std.textureStore(velocityLayout.$.velocityOut, gid.xy, d.vec4f(projected, 0, 1));
});

const advectInk = tgpu.computeFn({
  workgroupSize: [16, 16],
  in: { gid: d.builtin.globalInvocationId },
})(({ gid }) => {
  'use gpu';
  if (gid.x >= SIM_SIZE || gid.y >= SIM_SIZE) {
    return;
  }

  const uv = cellUv(gid.xy);
  const origin = uv - (params.$.dt * loadVelocity(d.vec2i(gid.xy))) / SIM_SIZE;
  const ink = std.textureSampleLevel(inkLayout.$.ink, sampler.$, origin, 0).x * params.$.inkDecay;

  const added = std.mix(ink, 1, INK_AMOUNT * brushWeight(uv));
  std.textureStore(inkLayout.$.inkOut, gid.xy, d.vec4f(added, 0, 0, 1));
});

const sampleInk = (uv: d.v2f) => {
  'use gpu';
  return std.textureSampleLevel(inkLayout.$.ink, sampler.$, uv, 0).x;
};

const sampleBackground = (uv: d.v2f) => {
  'use gpu';
  return std.textureSample(background.$, sampler.$, uv);
};

const shade = tgpu.fragmentFn({ in: { uv: d.vec2f }, out: d.vec4f })(({ uv }) => {
  'use gpu';
  if (displayMode.$ === 1) {
    const flow = std.textureSampleLevel(velocityLayout.$.velocity, sampler.$, uv, 0).xy;
    return d.vec4f((flow * d.vec2f(1, -1) + 1) * 0.5, std.length(flow) * 0.4, 1);
  }

  if (displayMode.$ === 2) {
    const density = sampleInk(uv);
    return d.vec4f(density, density * 0.8, density * 0.5, 1);
  }

  const texel = d.vec2f(1 / SIM_SIZE, 0);
  const slope = d.vec2f(
    sampleInk(uv + texel) - sampleInk(uv - texel),
    sampleInk(uv + texel.yx) - sampleInk(uv - texel.yx),
  );
  const normal = std.normalize(d.vec3f(slope * -8, 1));

  const color = d.vec3f(
    sampleBackground(uv - normal.xy * 0.09).r,
    sampleBackground(uv - normal.xy * 0.1).g,
    sampleBackground(uv - normal.xy * 0.11).b,
  );

  const halfway = std.normalize(std.normalize(LIGHT) + d.vec3f(0, 0, 1));
  const specular = std.pow(std.max(std.dot(normal, halfway), 0), 80) * 0.6;
  return d.vec4f(color + specular, 1);
});

const advectVelocityPipeline = root.createComputePipeline({ compute: advectVelocity });
const diffusePipeline = root.createComputePipeline({ compute: diffuse });
const divergencePipeline = root.createComputePipeline({ compute: computeDivergence });
const relaxRedPipeline = root.with(redBlack, 0).createComputePipeline({ compute: relaxPressure });
const relaxBlackPipeline = root.with(redBlack, 1).createComputePipeline({ compute: relaxPressure });
const projectPipeline = root.createComputePipeline({ compute: project });
const advectInkPipeline = root.createComputePipeline({ compute: advectInk });
const displayPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: shade,
});

let dt = 0.5;
let viscosity = 5;
let inkFade = 0.001;
let iterations = 10;
let paused = false;

const brush = { from: d.vec2f(), to: d.vec2f(), down: false };

let velocityIndex = 0;
let inkIndex = 0;

function stepVelocity(pass: TgpuComputePass, pipeline: TgpuComputePipeline) {
  pipeline
    .with(velocityGroups[velocityIndex])
    .with(pass)
    .dispatchWorkgroups(WORKGROUPS, WORKGROUPS);
  velocityIndex ^= 1;
}

function simulate(pass: TgpuComputePass) {
  params.write({
    dt,
    diffusion: Math.min((viscosity * dt) / iterations, 0.25),
    inkDecay: 1 / (1 + dt * inkFade),
    brushFrom: brush.from,
    brushTo: brush.to,
    brushDown: brush.down ? 1 : 0,
  });
  brush.from = brush.to;

  stepVelocity(pass, advectVelocityPipeline);
  for (let i = 0; i < iterations; i++) {
    stepVelocity(pass, diffusePipeline);
  }

  divergencePipeline
    .with(velocityGroups[velocityIndex])
    .with(pass)
    .dispatchWorkgroups(WORKGROUPS, WORKGROUPS);
  for (let i = 0; i < iterations; i++) {
    relaxRedPipeline.with(pass).dispatchWorkgroups(WORKGROUPS / 2, WORKGROUPS);
    relaxBlackPipeline.with(pass).dispatchWorkgroups(WORKGROUPS / 2, WORKGROUPS);
  }
  stepVelocity(pass, projectPipeline);

  advectInkPipeline
    .with(velocityGroups[velocityIndex])
    .with(inkGroups[inkIndex])
    .with(pass)
    .dispatchWorkgroups(WORKGROUPS, WORKGROUPS);
  inkIndex ^= 1;
}

let frameId = requestAnimationFrame(frame);

function frame() {
  const encoder = root['~unstable'].createCommandEncoder();
  if (!paused) {
    const pass = encoder.beginComputePass();
    simulate(pass);
    pass.end();
  }

  const pass = encoder.beginRenderPass({ colorAttachments: { view: context } });
  displayPipeline.with(velocityGroups[velocityIndex]).with(inkGroups[inkIndex]).with(pass).draw(3);
  pass.end();
  encoder.submit();

  frameId = requestAnimationFrame(frame);
}

// #region Example controls and cleanup

const uvOf = (e: PointerEvent) =>
  d.vec2f(e.offsetX / canvas.clientWidth, e.offsetY / canvas.clientHeight);

canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  brush.from = brush.to = uvOf(e);
  brush.down = true;
});

canvas.addEventListener('pointermove', (e) => {
  brush.to = uvOf(e);
});

for (const type of ['pointerup', 'pointercancel'] as const) {
  canvas.addEventListener(type, () => {
    brush.down = false;
  });
}

canvas.addEventListener(
  'pointerdown',
  () => {
    (document.getElementById('help') as HTMLElement).style.opacity = '0';
  },
  { once: true },
);

export const controls = defineControls({
  'timestep (dt)': {
    initial: 0.5,
    min: 0.05,
    max: 2,
    step: 0.01,
    onSliderChange: (value) => {
      dt = value;
    },
  },
  viscosity: {
    initial: 5,
    min: 0,
    max: 5,
    step: 0.01,
    onSliderChange: (value) => {
      viscosity = value;
    },
  },
  'ink fade': {
    initial: 0.001,
    min: 0,
    max: 0.02,
    step: 0.0005,
    onSliderChange: (value) => {
      inkFade = value;
    },
  },
  'solver iterations': {
    initial: 10,
    min: 1,
    max: 50,
    step: 1,
    onSliderChange: (value) => {
      iterations = value;
    },
  },
  visualization: {
    initial: 'image',
    options: ['image', 'velocity', 'ink'],
    onSelectChange: (value) => {
      displayMode.write(['image', 'velocity', 'ink'].indexOf(value));
    },
  },
  pause: {
    initial: false,
    onToggleChange: (value) => {
      paused = value;
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(frameId);
  root.destroy();
}

// #endregion
