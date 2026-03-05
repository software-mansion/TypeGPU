import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { generateGridTrack, type TrackResult } from './track.ts';
import {
  CarState,
  CarStateArray,
  CarStateLayout,
  DEFAULT_POP,
  Genome,
  GenomeArray,
  MAX_POP,
  SimParams,
  createGeneticPopulation,
} from './ga.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const STEPS_PER_GENERATION = 480;

const BASE_SPATIAL_PARAMS = {
  maxSpeed: 0.6,
  accel: 1.6,
  turnRate: 3.5,
  drag: 0.6,
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
  const car = CarState(simLayout.$.state[i]);
  const genome = Genome(simLayout.$.genome[i]);
  const wasAlive = car.alive === 1;

  const sLL = senseRaycast(car.position, car.angle, 1.05);
  const sL = senseRaycast(car.position, car.angle, 0.52);
  const sF = senseRaycast(car.position, car.angle, 0);
  const sR = senseRaycast(car.position, car.angle, -0.52);
  const sRR = senseRaycast(car.position, car.angle, -1.05);
  const normSpeed = car.speed / params.$.maxSpeed;

  const carForward = d.vec2f(std.cos(car.angle), std.sin(car.angle));
  const trackHere = sampleTrack(car.position, nearestSampler.$);
  const trackAlignment = std.dot(carForward, trackHere.xy); // +1 = aligned, -1 = backwards
  const aheadPos = car.position + carForward * params.$.sensorDistance;
  const trackAhead = sampleTrack(aheadPos, nearestSampler.$);
  // positive = track turns left ahead, negative = right
  const trackCurvature = carForward.x * trackAhead.y - carForward.y * trackAhead.x;

  const inputs4 = d.vec4f(sLL, sL, sF, sR);
  const inputsExtra = d.vec4f(sRR, normSpeed, trackAlignment, trackCurvature);

  const steerRaw =
    std.dot(genome.steer, inputs4) + std.dot(genome.steerExtra, inputsExtra) + genome.bias.x;
  const throttleRaw =
    std.dot(genome.throttle, inputs4) + std.dot(genome.throttleExtra, inputsExtra) + genome.bias.y;

  const steer = std.clamp(steerRaw, -1, 1);
  const throttle = std.clamp(throttleRaw, -1, 1);

  let speed = car.speed + throttle * params.$.accel * params.$.dt;
  speed = speed * (1 - params.$.drag * params.$.dt);
  speed = std.clamp(speed, 0, params.$.maxSpeed);

  const slowThreshold = params.$.maxSpeed * 0.04;
  const canTurn = speed > slowThreshold;
  const targetAngVel = std.select(0, steer * params.$.turnRate, canTurn);
  const angVel = car.angVel * 0.75 + targetAngVel * 0.25;
  const angle = car.angle + angVel * params.$.dt;

  const dir = d.vec2f(std.cos(angle), std.sin(angle));
  const position = car.position + dir * speed * params.$.dt;

  const sampleEnd = sampleTrack(position, nearestSampler.$);
  const onTrackEnd = sampleEnd.z > 0.5;
  const step = position - car.position;
  const sampleA = sampleTrack(car.position + step * 0.33, nearestSampler.$);
  const sampleB = sampleTrack(car.position + step * 0.66, nearestSampler.$);
  const stallSteps = std.select(d.u32(0), car.stallSteps + 1, speed < slowThreshold);
  // Gate onTrack by wasAlive so dead cars stay dead and their state stays frozen
  const onTrack = wasAlive && stallSteps < 120 && onTrackEnd && sampleA.z > 0.5 && sampleB.z > 0.5;

  const aliveMask = std.select(0, d.f32(1), onTrack);
  const alive = std.select(d.u32(0), d.u32(1), onTrack);
  const forward = std.dot(dir, sampleEnd.xy);

  const lapLength = params.$.trackLength * params.$.trackScale;
  const progress =
    car.progress + (speed * std.max(0, forward) * params.$.dt * aliveMask) / lapLength;

  simLayout.$.state[i] = CarState({
    position: std.select(car.position, position, onTrack),
    angle: std.select(car.angle, angle, onTrack),
    speed: std.select(0, speed, onTrack),
    alive,
    progress,
    angVel: std.select(0, angVel, onTrack),
    aliveSteps: car.aliveSteps + std.select(d.u32(0), d.u32(1), wasAlive),
    stallSteps,
  });
});

const trackFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const ndc = d.vec2f(uv.x * 2 - 1, 1 - uv.y * 2);
  const p = d.vec2f(ndc.x * params.$.aspect, ndc.y);
  const sample = sampleTrack(p, linearSampler.$);

  const grass = d.vec3f(0.05, 0.06, 0.08);
  const road = d.vec3f(0.14, 0.16, 0.2);
  const mask = sample.z;
  const color = std.mix(grass, road, mask);
  const edge = 1 - std.smoothstep(0.6, 0.95, mask);
  const painted = color + d.vec3f(0.2, 0.22, 0.3) * edge * mask;

  return d.vec4f(painted, 1);
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
  const tint = std.mix(d.vec3f(0.4, 0.6, 1.0), d.vec3f(1.0, 0.85, 0.15), t);
  const lum = std.dot(sample.xyz, d.vec3f(0.299, 0.587, 0.114));
  const rgb = std.mix(d.vec3f(lum) * 0.4, sample.xyz * tint, isAlive);
  const a = sample.w * std.mix(0.45, 1, isAlive);
  return d.vec4f(rgb * a, a);
});

const trackPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: trackFragment,
  targets: { format: presentationFormat },
});

const instanceLayout = tgpu.vertexLayout(CarStateLayout, 'instance');

const carPipeline = root.createRenderPipeline({
  attribs: {
    position: instanceLayout.attrib.position,
    angle: instanceLayout.attrib.angle,
    alive: instanceLayout.attrib.alive,
    progress: instanceLayout.attrib.progress,
  },
  vertex: carVertex,
  fragment: carFragment,
  primitive: { topology: 'triangle-strip' },
  targets: {
    format: presentationFormat,
    blend: {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    },
  },
});

let steps = 0;
let stepsPerFrame = 4;
let stepsPerGeneration = STEPS_PER_GENERATION;
let paused = false;
let lastAspect = 1;
let population = DEFAULT_POP;
let rafHandle = 0;

const statsDiv = document.querySelector('.stats') as HTMLDivElement;

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

function updateAspect() {
  if (!canvas.width || !canvas.height) return;
  const nextAspect = canvas.width / canvas.height;
  if (Math.abs(nextAspect - lastAspect) < 0.001) return;
  lastAspect = nextAspect;
  params.writePartial({ aspect: nextAspect });
}

function updatePopulation(nextPopulation: number) {
  const clamped = Math.max(128, Math.min(MAX_POP, Math.floor(nextPopulation)));
  if (clamped === population) return;
  population = clamped;
  params.writePartial({ population: clamped });
  ga.reinitCurrent(population);
}

function frame() {
  updateAspect();

  if (!paused) {
    for (let i = 0; i < stepsPerFrame; i++) {
      simulatePipeline.with(simBindGroups[ga.current]).dispatchThreads(population);
    }
    steps += stepsPerFrame;

    if (steps >= stepsPerGeneration) {
      ga.evolve(population);
      steps = 0;
      params.writePartial({ generation: ga.generation });
    }
  }

  statsDiv.textContent = `Gen ${ga.generation}  Step ${Math.min(steps, stepsPerGeneration)}/${stepsPerGeneration}  Pop ${population}`;

  trackPipeline.withColorAttachment({ view: context, clearValue: [0.04, 0.05, 0.07, 1] }).draw(3);

  carPipeline
    .withColorAttachment({ view: context, loadOp: 'load', storeOp: 'store' })
    .with(instanceLayout, ga.currentStateBuffer)
    .draw(4, population);

  rafHandle = requestAnimationFrame(frame);
}

function startSimulation() {
  steps = 0;
  params.writePartial({ generation: 0 });
  ga.init();

  updateAspect();
  updatePopulation(population);
  cancelAnimationFrame(rafHandle);
  rafHandle = requestAnimationFrame(frame);
}

const GRID_SIZES: Record<string, [number, number]> = {
  S: [5, 4],
  M: [8, 6],
  L: [10, 9],
  XL: [14, 12],
};

let trackSeed = (Math.random() * 100_000) | 0;
let gridSizeKey = 'S';

function applyGridSize(W: number, H: number) {
  const scale = 5 / Math.max(W, H);
  params.writePartial(
    Object.fromEntries(
      Object.entries(BASE_SPATIAL_PARAMS).map(([k, v]) => [k, v * scale]),
    ) as typeof BASE_SPATIAL_PARAMS,
  );
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
  'Steps per frame': {
    initial: stepsPerFrame,
    min: 1,
    max: 1024,
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
