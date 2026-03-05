import { randf } from '@typegpu/noise';
import tgpu, { d, std } from 'typegpu';
import type { TgpuRoot, TgpuUniform } from 'typegpu';

export const MAX_POP = 65536;
export const DEFAULT_POP = 8192;

export const CarState = d.struct({
  position: d.vec2f,
  angle: d.f32,
  speed: d.f32,
  alive: d.u32,
  progress: d.f32,
  angVel: d.f32,
  aliveSteps: d.u32,
  stallSteps: d.u32,
});

export const Genome = d.struct({
  steer: d.vec4f,
  throttle: d.vec4f,
  steerExtra: d.vec4f,
  throttleExtra: d.vec4f,
  bias: d.vec2f,
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
});

export const CarStateArray = d.arrayOf(CarState, MAX_POP);
export const GenomeArray = d.arrayOf(Genome, MAX_POP);
export const CarStateLayout = d.arrayOf(CarState);

export const paramsAccess = tgpu.accessor(SimParams);

const initLayout = tgpu.bindGroupLayout({
  state: { storage: CarStateArray, access: 'mutable' },
  genome: { storage: GenomeArray, access: 'mutable' },
});

const evolveLayout = tgpu.bindGroupLayout({
  state: { storage: CarStateArray },
  genome: { storage: GenomeArray },
  nextState: { storage: CarStateArray, access: 'mutable' },
  nextGenome: { storage: GenomeArray, access: 'mutable' },
});

const randSignedVec4 = () => {
  'use gpu';
  return (d.vec4f(randf.sample(), randf.sample(), randf.sample(), randf.sample()) * 2 - 1) * 0.8;
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

const computeFitness = (idx: number) => {
  'use gpu';
  const s = evolveLayout.$.state[idx];
  return s.progress * 10 + d.f32(s.aliveSteps) * 0.003;
};

const tournamentSelect = () => {
  'use gpu';
  let best = d.u32(0);
  let bestFitness = d.f32(-1);
  for (let j = 0; j < 8; j++) {
    const idx = d.u32(randf.sample() * d.f32(paramsAccess.$.population));
    const f = computeFitness(idx);
    const better = f > bestFitness;
    bestFitness = std.select(bestFitness, f, better);
    best = std.select(best, idx, better);
  }
  return best;
};

const evolveScalar = (a: number, b: number) => {
  'use gpu';
  const crossed = std.select(a, b, randf.sample() > 0.5);
  return (
    crossed +
    std.select(
      0,
      randf.normal(0, paramsAccess.$.mutationStrength),
      randf.sample() < paramsAccess.$.mutationRate,
    )
  );
};

const evolveVec4 = (a: d.v4f, b: d.v4f) => {
  'use gpu';
  return d.vec4f(
    evolveScalar(a.x, b.x),
    evolveScalar(a.y, b.y),
    evolveScalar(a.z, b.z),
    evolveScalar(a.w, b.w),
  );
};

const evolveVec2 = (a: d.v2f, b: d.v2f) => {
  'use gpu';
  return d.vec2f(evolveScalar(a.x, b.x), evolveScalar(a.y, b.y));
};

const initShader = (i: number) => {
  'use gpu';
  if (d.u32(i) >= paramsAccess.$.population) {
    return;
  }
  randf.seed2(d.vec2f(d.f32(i) + 1, paramsAccess.$.generation + 11));

  initLayout.$.genome[i] = Genome({
    steer: randSignedVec4(),
    throttle: randSignedVec4(),
    steerExtra: randSignedVec4(),
    throttleExtra: randSignedVec4(),
    bias: (d.vec2f(randf.sample(), randf.sample()) * 2 - 1) * 0.2,
  });
  initLayout.$.state[i] = makeSpawnState();
};

const evolveShader = (i: number) => {
  'use gpu';
  if (d.u32(i) >= paramsAccess.$.population) return;
  randf.seed2(d.vec2f(d.f32(i) + 3, paramsAccess.$.generation + 19));

  const parentA = Genome(evolveLayout.$.genome[tournamentSelect()]);
  const parentB = Genome(evolveLayout.$.genome[tournamentSelect()]);

  evolveLayout.$.nextGenome[i] = Genome({
    steer: evolveVec4(parentA.steer, parentB.steer),
    throttle: evolveVec4(parentA.throttle, parentB.throttle),
    steerExtra: evolveVec4(parentA.steerExtra, parentB.steerExtra),
    throttleExtra: evolveVec4(parentA.throttleExtra, parentB.throttleExtra),
    bias: evolveVec2(parentA.bias, parentB.bias),
  });

  evolveLayout.$.nextState[i] = makeSpawnState();
};

export function createGeneticPopulation(root: TgpuRoot, params: TgpuUniform<typeof SimParams>) {
  const stateBuffers = [0, 1].map(() =>
    root.createBuffer(CarStateArray).$usage('storage', 'vertex'),
  );
  const genomeBuffers = [0, 1].map(() => root.createBuffer(GenomeArray).$usage('storage'));

  const initBindGroups = [0, 1].map((i) =>
    root.createBindGroup(initLayout, {
      state: stateBuffers[i],
      genome: genomeBuffers[i],
    }),
  );

  const evolveBindGroups = [0, 1].map((i) =>
    root.createBindGroup(evolveLayout, {
      state: stateBuffers[i],
      genome: genomeBuffers[i],
      nextState: stateBuffers[1 - i],
      nextGenome: genomeBuffers[1 - i],
    }),
  );

  const initPipeline = root.with(paramsAccess, params).createGuardedComputePipeline(initShader);

  const evolvePipeline = root.with(paramsAccess, params).createGuardedComputePipeline(evolveShader);

  let current = 0;
  let generation = 0;

  return {
    stateBuffers,
    genomeBuffers,
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

    evolve(population: number) {
      evolvePipeline.with(evolveBindGroups[current]).dispatchThreads(population);
      current = 1 - current;
      generation++;
    },
  };
}
