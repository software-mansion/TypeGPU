import { randf } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';
import type { TgpuRoot, TgpuUniform } from 'typegpu';

export const MAX_POP = 65536;
export const DEFAULT_POP = 8192;

export const CarState = d.struct({
  position: d.vec2f,
  angle: d.f32,
  alive: d.u32,
  progress: d.f32,
  speed: d.f32,
  angVel: d.f32,
  aliveSteps: d.u32,
  stallSteps: d.u32,
});

export const FitnessArray = d.arrayOf(d.f32, MAX_POP);

export const InputLayer = d.struct({
  wA: d.mat4x4f, // inputs[0..3]
  wB: d.mat4x4f, // inputs[4..7]
  wC: d.mat4x4f, // inputs[8..11]
  bias: d.vec4f,
});

export const DenseLayer = d.struct({
  w: d.mat4x4f,
  bias: d.vec4f,
});

export const OutputLayer = d.struct({
  steer: d.vec4f,
  throttle: d.vec4f,
  bias: d.vec2f,
});

export const Genome = d.struct({
  h1: InputLayer,
  h2: DenseLayer,
  out: OutputLayer,
});

export const SimParams = d.struct({
  dt: d.f32,
  aspect: d.f32,
  generation: d.f32,
  population: d.u32,
  maxSpeed: d.f32,
  accel: d.f32,
  turnRate: d.f32,
  drag: d.f32,
  sensorDistance: d.f32,
  mutationRate: d.f32,
  mutationStrength: d.f32,
  carSize: d.f32,
  trackScale: d.f32,
  trackLength: d.f32,
  spawnX: d.f32,
  spawnY: d.f32,
  spawnAngle: d.f32,
  stepsPerDispatch: d.u32,
});

export const CarStateArray = d.arrayOf(CarState, MAX_POP);
export const GenomeArray = d.arrayOf(Genome, MAX_POP);
export const CarStateLayout = d.arrayOf(CarState);

export const paramsAccess = tgpu.accessor(SimParams);

const fitLayout = tgpu.bindGroupLayout({
  state: { storage: CarStateArray },
  fitness: { storage: FitnessArray, access: 'mutable' },
});

const initLayout = tgpu.bindGroupLayout({
  state: { storage: CarStateArray, access: 'mutable' },
  genome: { storage: GenomeArray, access: 'mutable' },
});

const evolveLayout = tgpu.bindGroupLayout({
  fitness: { storage: FitnessArray },
  genome: { storage: GenomeArray },
  nextState: { storage: CarStateArray, access: 'mutable' },
  nextGenome: { storage: GenomeArray, access: 'mutable' },
  bestIdx: { storage: d.u32 },
});

const randSignedVec4 = () => {
  'use gpu';
  return (d.vec4f(randf.sample(), randf.sample(), randf.sample(), randf.sample()) * 2 - 1) * 0.8;
};

const randSignedMat4x4 = () => {
  'use gpu';
  return d.mat4x4f(randSignedVec4(), randSignedVec4(), randSignedVec4(), randSignedVec4());
};

const makeSpawnState = () => {
  'use gpu';
  const spawn = d.vec2f(paramsAccess.$.spawnX, paramsAccess.$.spawnY) * paramsAccess.$.trackScale;
  return CarState({
    position: spawn,
    angle: paramsAccess.$.spawnAngle,
    speed: 0,
    alive: 1,
    progress: 0,
    angVel: 0,
    aliveSteps: 0,
    stallSteps: 0,
  });
};

const tournamentSelect = () => {
  'use gpu';
  const population = d.f32(paramsAccess.$.population);
  let best = d.u32(0);
  let bestFitness = d.f32(-1);
  for (let j = 0; j < 8; j++) {
    const idx = d.u32(randf.sample() * population);
    const f = evolveLayout.$.fitness[idx];
    const better = f > bestFitness;
    bestFitness = std.select(bestFitness, f, better);
    best = std.select(best, idx, better);
  }
  return best;
};

const evolveVec = <T extends d.v2f | d.v4f>(a: T, b: T): T => {
  'use gpu';
  const strength = paramsAccess.$.mutationStrength;
  const crossed = std.select(a, b, randf.sample() > 0.5);
  const doMutate = randf.sample() < paramsAccess.$.mutationRate;
  if (a.kind === 'vec2f') {
    const delta = d.vec2f(randf.normal(0, strength), randf.normal(0, strength));
    return ((crossed as d.v2f) + std.select(d.vec2f(0), delta, doMutate)) as T;
  } else {
    const delta = d.vec4f(
      randf.normal(0, strength),
      randf.normal(0, strength),
      randf.normal(0, strength),
      randf.normal(0, strength),
    );
    return ((crossed as d.v4f) + std.select(d.vec4f(0), delta, doMutate)) as T;
  }
};

const evolveMat4x4 = (a: d.m4x4f, b: d.m4x4f) => {
  'use gpu';
  return d.mat4x4f(
    evolveVec(a.columns[0], b.columns[0]),
    evolveVec(a.columns[1], b.columns[1]),
    evolveVec(a.columns[2], b.columns[2]),
    evolveVec(a.columns[3], b.columns[3]),
  );
};

const evolveInputLayer = (a: d.InferGPU<typeof InputLayer>, b: d.InferGPU<typeof InputLayer>) => {
  'use gpu';
  return InputLayer({
    wA: evolveMat4x4(a.wA, b.wA),
    wB: evolveMat4x4(a.wB, b.wB),
    wC: evolveMat4x4(a.wC, b.wC),
    bias: evolveVec(a.bias, b.bias),
  });
};

const evolveDenseLayer = (a: d.InferGPU<typeof DenseLayer>, b: d.InferGPU<typeof DenseLayer>) => {
  'use gpu';
  return DenseLayer({ w: evolveMat4x4(a.w, b.w), bias: evolveVec(a.bias, b.bias) });
};

const evolveOutputLayer = (
  a: d.InferGPU<typeof OutputLayer>,
  b: d.InferGPU<typeof OutputLayer>,
) => {
  'use gpu';
  return OutputLayer({
    steer: evolveVec(a.steer, b.steer),
    throttle: evolveVec(a.throttle, b.throttle),
    bias: evolveVec(a.bias, b.bias),
  });
};

const fitShader = (i: number) => {
  'use gpu';
  if (d.u32(i) >= paramsAccess.$.population) {
    return;
  }
  const s = CarState(fitLayout.$.state[i]);
  fitLayout.$.fitness[i] = s.progress * 10 + d.f32(s.aliveSteps) * 0.003;
};

const initShader = (i: number) => {
  'use gpu';
  if (d.u32(i) >= paramsAccess.$.population) {
    return;
  }
  randf.seed2(d.vec2f(d.f32(i) + 1, paramsAccess.$.generation + 11));

  initLayout.$.genome[i] = Genome({
    h1: {
      wA: randSignedMat4x4(),
      wB: randSignedMat4x4(),
      wC: randSignedMat4x4(),
      bias: d.vec4f(),
    },
    h2: { w: randSignedMat4x4(), bias: d.vec4f() },
    out: { steer: randSignedVec4(), throttle: randSignedVec4(), bias: d.vec2f() },
  });
  initLayout.$.state[i] = makeSpawnState();
};

const evolveShader = (i: number) => {
  'use gpu';
  if (d.u32(i) >= paramsAccess.$.population) {
    return;
  }

  // Elitism: champion always lives at index 0, copied unchanged
  if (d.u32(i) === 0) {
    evolveLayout.$.nextGenome[0] = Genome(evolveLayout.$.genome[evolveLayout.$.bestIdx]);
    evolveLayout.$.nextState[0] = makeSpawnState();
    return;
  }

  randf.seed2(d.vec2f(d.f32(i) + 3, paramsAccess.$.generation + 19));

  const parentA = Genome(evolveLayout.$.genome[tournamentSelect()]);
  const parentB = Genome(evolveLayout.$.genome[tournamentSelect()]);

  evolveLayout.$.nextGenome[i] = Genome({
    h1: evolveInputLayer(parentA.h1, parentB.h1),
    h2: evolveDenseLayer(parentA.h2, parentB.h2),
    out: evolveOutputLayer(parentA.out, parentB.out),
  });

  evolveLayout.$.nextState[i] = makeSpawnState();
};

export function createGeneticPopulation(root: TgpuRoot, params: TgpuUniform<typeof SimParams>) {
  const stateBuffers = [0, 1].map(() =>
    root.createBuffer(CarStateArray).$usage('storage', 'vertex'),
  );
  const genomeBuffers = [0, 1].map(() => root.createBuffer(GenomeArray).$usage('storage'));
  const fitnessBuffer = root.createBuffer(FitnessArray).$usage('storage');
  const bestIdxBuffer = root.createBuffer(d.u32).$usage('storage');

  const initBindGroups = [0, 1].map((i) =>
    root.createBindGroup(initLayout, {
      state: stateBuffers[i],
      genome: genomeBuffers[i],
    }),
  );

  const fitBindGroups = [0, 1].map((i) =>
    root.createBindGroup(fitLayout, {
      state: stateBuffers[i],
      fitness: fitnessBuffer,
    }),
  );

  const evolveBindGroups = [0, 1].map((i) =>
    root.createBindGroup(evolveLayout, {
      fitness: fitnessBuffer,
      genome: genomeBuffers[i],
      nextState: stateBuffers[1 - i],
      nextGenome: genomeBuffers[1 - i],
      bestIdx: bestIdxBuffer,
    }),
  );

  const initPipeline = root.with(paramsAccess, params).createGuardedComputePipeline(initShader);
  const fitPipeline = root.with(paramsAccess, params).createGuardedComputePipeline(fitShader);
  const evolvePipeline = root.with(paramsAccess, params).createGuardedComputePipeline(evolveShader);

  let current = 0;
  let generation = 0;

  return {
    stateBuffers,
    genomeBuffers,
    fitnessBuffer,
    bestIdxBuffer,
    get current() {
      return current;
    },
    get generation() {
      return generation;
    },
    get currentStateBuffer() {
      return stateBuffers[current];
    },
    get currentGenomeBuffer() {
      return genomeBuffers[current];
    },

    init() {
      current = 0;
      generation = 0;
      initPipeline.with(initBindGroups[0]).dispatchThreads(MAX_POP);
      initPipeline.with(initBindGroups[1]).dispatchThreads(MAX_POP);
    },

    reinitCurrent(population: number) {
      initPipeline.with(initBindGroups[current]).dispatchThreads(population);
    },

    precomputeFitness(population: number) {
      fitPipeline.with(fitBindGroups[current]).dispatchThreads(population);
    },

    evolve(population: number) {
      evolvePipeline.with(evolveBindGroups[current]).dispatchThreads(population);
      current = 1 - current;
      generation++;
    },
  };
}
