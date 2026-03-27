import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { generateGridTrack, type TrackResult } from './track.ts';
import {
  CarState,
  CarStateArray,
  CarStateLayout,
  DEFAULT_POP,
  FitnessArray,
  Genome,
  GenomeArray,
  MAX_POP,
  SimParams,
  createGeneticPopulation,
} from './ga.ts';

const DEG_90 = Math.PI / 2;
const DEG_60 = Math.PI / 3;
const DEG_30 = Math.PI / 6;

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const STEPS_PER_DISPATCH = 32;

const BASE_SPATIAL_PARAMS = {
  maxSpeed: 1.6,
  accel: 0.2,
  turnRate: 5.5,
  drag: 0.3,
  sensorDistance: 0.28,
  carSize: 0.02,
};

const params = root.createUniform(SimParams, {
  dt: 1 / 120,
  aspect: 1,
  generation: 0,
  population: DEFAULT_POP,
  mutationRate: 0.05,
  mutationStrength: 0.15,
  trackScale: 0.9,
  trackLength: 1,
  spawnX: 0,
  spawnY: 0,
  spawnAngle: 0,
  stepsPerDispatch: STEPS_PER_DISPATCH,
  ...BASE_SPATIAL_PARAMS,
});

const ga = createGeneticPopulation(root, params);

const trackTexture = root['~unstable']
  .createTexture({ size: [512, 512], format: 'rgba8unorm' })
  .$usage('render', 'sampled');
const trackView = trackTexture.createView();

const carBitmap = await fetch('/TypeGPU/assets/genetic-car/car.png')
  .then((r) => r.blob())
  .then(createImageBitmap);

const carSpriteTexture = root['~unstable']
  .createTexture({
    size: [carBitmap.width / 2, carBitmap.height / 2],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
carSpriteTexture.write(carBitmap);
const carSpriteView = carSpriteTexture.createView();

const linearSampler = root['~unstable'].createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});
const nearestSampler = root['~unstable'].createSampler({
  magFilter: 'nearest',
  minFilter: 'nearest',
});

const toTrackSpace = (p: d.v2f) => {
  'use gpu';
  return p / params.$.trackScale;
};

const toTrackUV = (p: d.v2f) => {
  'use gpu';
  const uvBase = (toTrackSpace(p) + 1) * 0.5;
  return d.vec2f(uvBase.x, 1 - uvBase.y);
};

const sampleTrack = (p: d.v2f, sampler: d.sampler) => {
  'use gpu';
  const sample = std.textureSampleLevel(trackView.$, sampler, toTrackUV(p), 0);
  return d.vec3f(sample.xy * 2 - 1, sample.z);
};

const rotate = (v: d.v2f, angle: number) => {
  'use gpu';
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.vec2f(v.x * c - v.y * s, v.x * s + v.y * c);
};

const isOnTrack = (pos: d.v2f) => {
  'use gpu';
  return sampleTrack(pos, nearestSampler.$).z > 0.5;
};

const trackCross = (forward: d.v2f, pos: d.v2f) => {
  'use gpu';
  const t = sampleTrack(pos, nearestSampler.$);
  return forward.x * t.y - forward.y * t.x;
};

const senseRaycast = (pos: d.v2f, angle: number, offset: number) => {
  'use gpu';
  const dir = d.vec2f(std.cos(angle + offset), std.sin(angle + offset));
  let hitT = d.f32(1);
  for (const step of tgpu.unroll([1, 2, 3, 4, 5, 6, 7, 8])) {
    const t = d.f32(step / 8);
    const samplePos = pos + dir * t * params.$.sensorDistance;
    const s = sampleTrack(samplePos, nearestSampler.$);
    hitT = std.select(hitT, std.select(t, hitT, hitT < t), s.z < 0.5);
  }
  return hitT;
};

const evalNetwork = (genome: d.InferGPU<typeof Genome>, a: d.v4f, b: d.v4f, c: d.v4f) => {
  'use gpu';
  const h1 = std.tanh(
    std.transpose(genome.h1.wA) * a +
      std.transpose(genome.h1.wB) * b +
      std.transpose(genome.h1.wC) * c +
      genome.h1.bias,
  );
  const h2 = std.tanh(std.transpose(genome.h2.w) * h1 + genome.h2.bias);
  return std.clamp(
    d.vec2f(std.dot(genome.out.steer, h2), std.dot(genome.out.throttle, h2)) + genome.out.bias,
    d.vec2f(-1),
    d.vec2f(1),
  );
};

const simLayout = tgpu.bindGroupLayout({
  state: { storage: CarStateArray, access: 'mutable' },
  genome: { storage: GenomeArray },
});

const simBindGroups = [0, 1].map((i) =>
  root.createBindGroup(simLayout, {
    state: ga.stateBuffers[i],
    genome: ga.genomeBuffers[i],
  }),
);

const simulatePipeline = root.createGuardedComputePipeline((i) => {
  'use gpu';
  if (d.u32(i) >= params.$.population) {
    return;
  }

  const genome = Genome(simLayout.$.genome[i]);
  const initCar = CarState(simLayout.$.state[i]);

  let curPosition = d.vec2f(initCar.position);
  let curAngle = initCar.angle;
  let curSpeed = initCar.speed;
  let curAlive = initCar.alive;
  let curProgress = initCar.progress;
  let curAngVel = initCar.angVel;
  let curAliveSteps = initCar.aliveSteps;
  let curStallSteps = initCar.stallSteps;

  for (let s = d.u32(0); s < params.$.stepsPerDispatch; s++) {
    if (curAlive === 0) {
      break;
    }

    const carForward = d.vec2f(std.cos(curAngle), std.sin(curAngle));
    const aheadPos = curPosition + carForward * params.$.sensorDistance;

    const inputs4 = d.vec4f(
      senseRaycast(curPosition, curAngle, DEG_60),
      senseRaycast(curPosition, curAngle, DEG_30),
      senseRaycast(curPosition, curAngle, 0),
      senseRaycast(curPosition, curAngle, -DEG_30),
    );
    const inputsB = d.vec4f(
      senseRaycast(curPosition, curAngle, -DEG_60),
      curSpeed / params.$.maxSpeed,
      std.dot(carForward, sampleTrack(curPosition, nearestSampler.$).xy),
      trackCross(carForward, aheadPos),
    );
    const inputsC = d.vec4f(
      curAngVel / params.$.turnRate,
      senseRaycast(curPosition, curAngle, DEG_90),
      senseRaycast(curPosition, curAngle, -DEG_90),
      trackCross(carForward, curPosition + carForward * params.$.sensorDistance * 2),
    );

    const control = evalNetwork(genome, inputs4, inputsB, inputsC);
    const steer = control.x;
    const throttle = control.y;

    let speed = curSpeed + throttle * params.$.accel * params.$.dt;
    speed = speed * (1 - params.$.drag * speed * params.$.dt);
    speed = std.clamp(speed, 0, params.$.maxSpeed);

    const slowThreshold = params.$.maxSpeed * 0.04;
    const canTurn = speed > slowThreshold;
    const normSpeed = speed / params.$.maxSpeed;
    const turnFactor = (1 - normSpeed) * (1 - normSpeed);
    const targetAngVel = std.select(0, steer * params.$.turnRate * turnFactor, canTurn);
    const angVel = curAngVel * 0.75 + targetAngVel * 0.25;
    const angle = curAngle + angVel * params.$.dt;

    const dir = d.vec2f(std.cos(angle), std.sin(angle));
    const position = curPosition + dir * speed * params.$.dt;
    const stepVec = position - curPosition;

    const stallSteps = std.select(d.u32(0), curStallSteps + 1, speed < slowThreshold);
    const trackEnd = sampleTrack(position, nearestSampler.$);
    const onTrack =
      stallSteps < 120 &&
      trackEnd.z > 0.5 &&
      isOnTrack(curPosition + stepVec * 0.33) &&
      isOnTrack(curPosition + stepVec * 0.66);

    const alive = std.select(d.u32(0), d.u32(1), onTrack);
    const forward = std.dot(dir, trackEnd.xy);
    const lapLength = params.$.trackLength * params.$.trackScale;

    curPosition = std.select(curPosition, position, onTrack);
    curAngle = std.select(curAngle, angle, onTrack);
    curSpeed = std.select(0, speed, onTrack);
    curAlive = alive;
    curProgress =
      curProgress + (speed * std.max(0, forward) * params.$.dt * d.f32(alive)) / lapLength;
    curAngVel = std.select(0, angVel, onTrack);
    curAliveSteps = curAliveSteps + 1;
    curStallSteps = stallSteps;
  }

  simLayout.$.state[i] = CarState({
    position: curPosition,
    angle: curAngle,
    speed: curSpeed,
    alive: curAlive,
    progress: curProgress,
    angVel: curAngVel,
    aliveSteps: curAliveSteps,
    stallSteps: curStallSteps,
  });
});

// upper 16 bits = quantized fitness [0,65535], lower 16 bits = car index
const reductionPackedBuffer = root.createBuffer(d.atomic(d.u32), 0).$usage('storage');
const bestFitnessBuffer = root.createBuffer(d.f32).$usage('storage');

const reductionLayout = tgpu.bindGroupLayout({
  fitness: { storage: FitnessArray },
  genome: { storage: GenomeArray },
  packed: { storage: d.atomic(d.u32), access: 'mutable' },
  bestIdx: { storage: d.u32, access: 'mutable' },
  bestFitness: { storage: d.f32, access: 'mutable' },
});

const reductionBindGroups = [0, 1].map((i) =>
  root.createBindGroup(reductionLayout, {
    fitness: ga.fitnessBuffer,
    genome: ga.genomeBuffers[i],
    bestIdx: ga.bestIdxBuffer,
    packed: reductionPackedBuffer,
    bestFitness: bestFitnessBuffer,
  }),
);

const reductionPipeline = root.createGuardedComputePipeline((i) => {
  'use gpu';
  if (d.u32(i) >= params.$.population) {
    return;
  }
  const fitness = reductionLayout.$.fitness[i];
  const quantized = d.u32(std.clamp(fitness / 64, 0, 1) * 65535);
  const packed = (quantized << 16) | (d.u32(i) & 0xffff);
  std.atomicMax(reductionLayout.$.packed, packed);
});

const finalizeReductionPipeline = root.createGuardedComputePipeline(() => {
  'use gpu';
  const packed = std.atomicLoad(reductionLayout.$.packed);
  reductionLayout.$.bestIdx = packed & 0xffff;
  reductionLayout.$.bestFitness = (d.f32(packed >> 16) / 65535) * 64;
});

const colors = {
  grass: tgpu.const(d.vec3f, d.vec3f(0.05, 0.06, 0.08)),
  road: tgpu.const(d.vec3f, d.vec3f(0.14, 0.16, 0.2)),
  paint: tgpu.const(d.vec3f, d.vec3f(0.2, 0.22, 0.3)),
};

const trackFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const p = d.vec2f((uv.x * 2 - 1) * params.$.aspect, 1 - uv.y * 2);
  const sample = sampleTrack(p, linearSampler.$);

  const mask = sample.z;
  const color = std.mix(colors.grass.$, colors.road.$, mask);
  const edge = 1 - std.smoothstep(0.6, 0.95, mask);
  const painted = color + colors.paint.$ * edge * mask;

  return d.vec4f(painted, 1);
});

const trackPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: trackFragment,
});

const carQuad = tgpu.const(d.arrayOf(d.vec4f, 4), [
  d.vec4f(-1, -1, 0, 1),
  d.vec4f(1, -1, 0, 0),
  d.vec4f(-1, 1, 1, 1),
  d.vec4f(1, 1, 1, 0),
]);

const carVertex = tgpu.vertexFn({
  in: {
    vertexIndex: d.builtin.vertexIndex,
    position: d.vec2f,
    angle: d.f32,
    alive: d.u32,
    progress: d.f32,
  },
  out: { pos: d.builtin.position, uv: d.vec2f, isAlive: d.f32, progress: d.f32 },
})((input) => {
  'use gpu';
  const q = carQuad.$[input.vertexIndex];
  const localPos = d.vec2f(q.x, q.y * 0.5) * params.$.carSize;
  const rotated = rotate(localPos, input.angle);
  const worldPos = rotated + input.position;
  const pos = d.vec4f(worldPos.x / params.$.aspect, worldPos.y, 0, 1);
  const isAlive = std.select(0, d.f32(1), input.alive === 1);
  return { pos, uv: q.zw, isAlive, progress: input.progress };
});

const carFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f, isAlive: d.f32, progress: d.f32 },
  out: d.vec4f,
})(({ uv, isAlive, progress }) => {
  'use gpu';
  const sample = std.textureSampleLevel(carSpriteView.$, linearSampler.$, uv, 0);
  const t = std.smoothstep(0, 1, progress);
  const baseTint = std.mix(d.vec3f(0.4, 0.6, 1.0), d.vec3f(1.0, 0.85, 0.15), t);
  const lapAccent = std.smoothstep(1, 10, progress);
  const tint = std.mix(baseTint, d.vec3f(0.15, 1.0, 0.35), lapAccent);
  const lum = std.dot(sample.xyz, d.vec3f(0.299, 0.587, 0.114));
  const rgb = std.mix(d.vec3f(lum) * 0.4, sample.xyz * tint, isAlive);
  const a = sample.w * std.mix(0.45, 1, isAlive);
  return d.vec4f(rgb * a, a);
});

const instanceLayout = tgpu.vertexLayout(CarStateLayout, 'instance');

const carPipeline = root.createRenderPipeline({
  attribs: instanceLayout.attrib,
  vertex: carVertex,
  fragment: carFragment,
  primitive: { topology: 'triangle-strip' },
  targets: {
    blend: {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    },
  },
});

let steps = 0;
let stepsPerFrame = STEPS_PER_DISPATCH;
let stepsPerGeneration = 2048;
let paused = false;
let lastAspect = 1;
let population = DEFAULT_POP;
let rafHandle = 0;
let pendingEvolve = false;
let showBestOnly = false;
let displayedBestFitness = 0;

const statsDiv = document.querySelector('.stats') as HTMLDivElement;

function updateAspect() {
  if (!canvas.width || !canvas.height) {
    return;
  }
  const nextAspect = canvas.width / canvas.height;
  if (Math.abs(nextAspect - lastAspect) < 0.001) {
    return;
  }
  lastAspect = nextAspect;
  params.writePartial({ aspect: nextAspect });
}

function updatePopulation(nextPopulation: number) {
  const clamped = Math.max(128, Math.min(MAX_POP, Math.floor(nextPopulation)));
  if (clamped === population) {
    return;
  }
  population = clamped;
  params.writePartial({ population: clamped });
  ga.reinitCurrent(population);
}

function frame() {
  updateAspect();

  if (!paused) {
    if (pendingEvolve) {
      ga.evolve(population);
      steps = 0;
      params.writePartial({ generation: ga.generation });
      pendingEvolve = false;
    }

    const stepsToRun = Math.min(stepsPerFrame, stepsPerGeneration - steps);
    if (stepsToRun <= 0) {
      pendingEvolve = true;
    } else {
      const innerSteps = Math.min(stepsToRun, STEPS_PER_DISPATCH);
      params.writePartial({ stepsPerDispatch: innerSteps });
      const dispatchCount = Math.ceil(stepsToRun / innerSteps);

      const simEncoder = root.device.createCommandEncoder();
      const encoderPipeline = simulatePipeline.with(simBindGroups[ga.current]).with(simEncoder);
      for (let dispatch = 0; dispatch < dispatchCount; dispatch++) {
        encoderPipeline.dispatchThreads(population);
      }
      root.device.queue.submit([simEncoder.finish()]);

      steps += dispatchCount * innerSteps;
    }

    if (steps >= stepsPerGeneration) {
      pendingEvolve = true;
      ga.precomputeFitness(population);
      const bg = reductionBindGroups[ga.current];

      const reductionEncoder = root.device.createCommandEncoder();
      reductionEncoder.clearBuffer(root.unwrap(reductionPackedBuffer));
      reductionPipeline.with(bg).with(reductionEncoder).dispatchThreads(population);
      finalizeReductionPipeline.with(bg).with(reductionEncoder).dispatchThreads();
      root.device.queue.submit([reductionEncoder.finish()]);

      void bestFitnessBuffer.read().then((fitness) => {
        displayedBestFitness = fitness;
      });
    }
  }

  const genStr = String(ga.generation).padStart(5);
  const stepStr = String(steps).padStart(String(stepsPerGeneration).length);
  const bestStr = displayedBestFitness.toFixed(2).padStart(6);
  const saturatedNote = displayedBestFitness >= 64 ? '  (saturated)' : '';
  statsDiv.textContent = `Gen ${genStr}  Step ${stepStr}/${stepsPerGeneration}  Pop ${population}  Best ${bestStr}${saturatedNote}`;

  trackPipeline.withColorAttachment({ view: context, clearValue: [0.04, 0.05, 0.07, 1] }).draw(3);

  carPipeline
    .withColorAttachment({ view: context, loadOp: 'load', storeOp: 'store' })
    .with(instanceLayout, ga.currentStateBuffer)
    .draw(4, showBestOnly ? 1 : population);

  rafHandle = requestAnimationFrame(frame);
}

function applyTrack(result: TrackResult) {
  trackTexture.write(
    new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
  );
  params.writePartial({
    spawnX: result.spawn.position[0],
    spawnY: result.spawn.position[1],
    spawnAngle: result.spawn.angle,
    trackLength: result.trackLength,
  });
}

function applyGridSize(W: number, H: number) {
  const scale = 5 / Math.max(W, H);
  params.writePartial(
    Object.fromEntries(
      Object.entries(BASE_SPATIAL_PARAMS).map(([k, v]) => [k, v * scale]),
    ) as typeof BASE_SPATIAL_PARAMS,
  );
}

const GRID_SIZES: Record<string, [number, number]> = {
  S: [5, 4],
  M: [8, 6],
  L: [10, 9],
  XL: [14, 12],
};

let trackSeed = (Math.random() * 100_000) | 0;
let gridSizeKey = 'S';

function startSimulation() {
  steps = 0;
  pendingEvolve = false;
  displayedBestFitness = 0;
  params.writePartial({ generation: 0 });
  ga.init();

  updateAspect();
  updatePopulation(population);
  cancelAnimationFrame(rafHandle);
  rafHandle = requestAnimationFrame(frame);
}

function newTrack() {
  trackSeed = (Math.random() * 100_000) | 0;
  const [W, H] = GRID_SIZES[gridSizeKey];
  applyGridSize(W, H);
  applyTrack(generateGridTrack(trackSeed, W, H));
  startSimulation();
}

applyGridSize(...GRID_SIZES[gridSizeKey]);
applyTrack(generateGridTrack(trackSeed, ...GRID_SIZES[gridSizeKey]));
startSimulation();

// #region Example controls & Cleanup

export const controls = defineControls({
  'New Track': { onButtonClick: newTrack },
  'Grid size': {
    initial: 'S',
    options: ['S', 'M', 'L', 'XL'],
    onSelectChange: (value: string) => {
      gridSizeKey = value;
      newTrack();
    },
  },
  Pause: {
    initial: false,
    onToggleChange: (value: boolean) => {
      paused = value;
    },
  },
  'Best car only': {
    initial: false,
    onToggleChange: (value: boolean) => {
      showBestOnly = value;
    },
  },
  'Steps per frame': {
    initial: stepsPerFrame,
    min: 1,
    max: 8192,
    step: 1,
    onSliderChange: (value: number) => {
      stepsPerFrame = value;
    },
  },
  'Steps per generation': {
    initial: stepsPerGeneration,
    min: 120,
    max: 9600,
    step: 60,
    onSliderChange: (value: number) => {
      stepsPerGeneration = value;
    },
  },
  Population: {
    initial: population,
    min: 256,
    max: MAX_POP,
    step: 256,
    onSliderChange: (value: number) => {
      updatePopulation(value);
    },
  },
  'Mutation rate': {
    initial: 0.05,
    min: 0,
    max: 0.4,
    step: 0.005,
    onSliderChange: (value: number) => {
      params.writePartial({ mutationRate: value });
    },
  },
  'Mutation strength': {
    initial: 0.15,
    min: 0.01,
    max: 0.8,
    step: 0.01,
    onSliderChange: (value: number) => {
      params.writePartial({ mutationStrength: value });
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(rafHandle);
  root.destroy();
}

// #endregion
