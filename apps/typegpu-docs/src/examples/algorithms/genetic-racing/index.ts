import tgpu, { common, d, std } from 'typegpu';

import { defineControls } from '../../common/defineControls.ts';
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
import { generateGridTrack, type TrackResult } from './track.ts';

const DEG_90 = Math.PI / 2;
const DEG_60 = Math.PI / 3;
const DEG_30 = Math.PI / 6;

const STEPS_PER_DISPATCH = 32;
const TRACK_TEXTURE_SIZE = 512;
const RACING_LINE_CAPACITY = 4096;
const DEFAULT_MUTATION_RATE = 0.05;
const DEFAULT_MUTATION_STRENGTH = 0.15;
const TRACK_CLEAR_COLOR = [0.04, 0.05, 0.07, 1] as const;

const BASE_SPATIAL_PARAMS = {
  maxSpeed: 1.6,
  accel: 0.2,
  turnRate: 5.5,
  drag: 0.3,
  sensorDistance: 0.28,
  carSize: 0.02,
};

const GRID_SIZES = {
  S: [5, 4],
  M: [8, 6],
  L: [10, 9],
  XL: [14, 12],
} as const satisfies Record<string, readonly [number, number]>;

type GridSizeKey = keyof typeof GRID_SIZES;
const GRID_SIZE_KEYS: GridSizeKey[] = ['S', 'M', 'L', 'XL'];

const RacingLinePoint = d.struct({
  position: d.vec2f,
  speed: d.f32,
  drive: d.f32,
  brake: d.f32,
  turn: d.f32,
});
const RacingLineArray = d.arrayOf(RacingLinePoint, RACING_LINE_CAPACITY * 2);
const RacingLineMeta = d.struct({
  cursor: d.u32,
  count: d.u32,
  peakSpeed: d.f32,
});

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const params = root.createUniform(SimParams, {
  dt: 1 / 120,
  aspect: 1,
  generation: 0,
  population: DEFAULT_POP,
  mutationRate: DEFAULT_MUTATION_RATE,
  mutationStrength: DEFAULT_MUTATION_STRENGTH,
  trackScale: 0.9,
  trackLength: 1,
  spawnX: 0,
  spawnY: 0,
  spawnAngle: 0,
  stepsPerDispatch: STEPS_PER_DISPATCH,
  ...BASE_SPATIAL_PARAMS,
});

const ga = createGeneticPopulation(root, params);

const trackTexture = root
  .createTexture({ size: [TRACK_TEXTURE_SIZE, TRACK_TEXTURE_SIZE], format: 'rgba8unorm' })
  .$usage('render', 'sampled');
const trackView = trackTexture.createView();

const carBitmap = await fetch('/TypeGPU/assets/genetic-car/car.png')
  .then((response) => response.blob())
  .then(createImageBitmap);

const carSpriteTexture = root
  .createTexture({
    size: [carBitmap.width / 2, carBitmap.height / 2],
    format: 'rgba8unorm',
  })
  .$usage('sampled', 'render');
carSpriteTexture.write(carBitmap);
const carSpriteView = carSpriteTexture.createView();

const linearSampler = root.createSampler({
  magFilter: 'linear',
  minFilter: 'linear',
});
const nearestSampler = root.createSampler({
  magFilter: 'nearest',
  minFilter: 'nearest',
});

const racingLineBuffer = root.createBuffer(RacingLineArray).$usage('storage', 'vertex');
const racingLineMetaBuffer = root
  .createBuffer(RacingLineMeta, { cursor: 0, count: 0, peakSpeed: 0 })
  .$usage('storage');

const toTrackSpace = (position: d.v2f) => {
  'use gpu';
  return position / params.$.trackScale;
};

const toTrackUv = (position: d.v2f) => {
  'use gpu';
  const uvBase = (toTrackSpace(position) + 1) * 0.5;
  return d.vec2f(uvBase.x, 1 - uvBase.y);
};

const sampleTrack = (position: d.v2f, sampler: d.sampler) => {
  'use gpu';
  const sample = std.textureSampleLevel(trackView.$, sampler, toTrackUv(position), 0);
  return d.vec3f(sample.xy * 2 - 1, sample.z);
};

const sampleTrackLinear = (position: d.v2f) => {
  'use gpu';
  return sampleTrack(position, linearSampler.$);
};

const sampleTrackNearest = (position: d.v2f) => {
  'use gpu';
  return sampleTrack(position, nearestSampler.$);
};

const isOnTrack = (position: d.v2f) => {
  'use gpu';
  return sampleTrackNearest(position).z > 0.5;
};

const trackCross = (forward: d.v2f, sample: d.v3f) => {
  'use gpu';
  return forward.x * sample.y - forward.y * sample.x;
};

const rotate = (vector: d.v2f, angle: number) => {
  'use gpu';
  const c = std.cos(angle);
  const s = std.sin(angle);
  return d.vec2f(vector.x * c - vector.y * s, vector.x * s + vector.y * c);
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

const senseRaycast = (position: d.v2f, angle: number, offset: number) => {
  'use gpu';
  const dir = d.vec2f(std.cos(angle + offset), std.sin(angle + offset));
  let hitT = d.f32(1);

  for (const step of tgpu.unroll(std.range(1, 9))) {
    const t = d.f32(step / 8);
    const samplePos = position + dir * t * params.$.sensorDistance;
    const sample = sampleTrackNearest(samplePos);
    hitT = std.select(hitT, std.select(t, hitT, hitT < t), sample.z < 0.5);
  }

  return hitT;
};

const simLayout = tgpu.bindGroupLayout({
  state: { storage: CarStateArray, access: 'mutable' },
  genome: { storage: GenomeArray },
  trail: { storage: RacingLineArray, access: 'mutable' },
  trailMeta: { storage: RacingLineMeta, access: 'mutable' },
});

const simBindGroups = [0, 1].map((index) =>
  root.createBindGroup(simLayout, {
    state: ga.stateBuffers[index],
    genome: ga.genomeBuffers[index],
    trail: racingLineBuffer,
    trailMeta: racingLineMetaBuffer,
  }),
);

const simulatePipeline = root.createGuardedComputePipeline((index) => {
  'use gpu';
  if (d.u32(index) >= params.$.population) {
    return;
  }

  const genome = Genome(simLayout.$.genome[index]);
  const initCar = CarState(simLayout.$.state[index]);

  let curPosition = d.vec2f(initCar.position);
  let curAngle = initCar.angle;
  let curSpeed = initCar.speed;
  let curAlive = initCar.alive;
  let curProgress = initCar.progress;
  let curAngVel = initCar.angVel;
  let curAliveSteps = initCar.aliveSteps;
  let curStallSteps = initCar.stallSteps;
  const isChampion = d.u32(index) === 0;
  const trailCapacity = d.u32(RACING_LINE_CAPACITY);
  let trailCursor = d.u32(0);
  let trailCount = d.u32(0);
  let trailPeakSpeed = d.f32(0);

  if (isChampion) {
    trailCursor = simLayout.$.trailMeta.cursor;
    trailCount = simLayout.$.trailMeta.count;
    trailPeakSpeed = simLayout.$.trailMeta.peakSpeed;
  }

  for (let step = d.u32(0); step < params.$.stepsPerDispatch; step++) {
    if (curAlive === 0) {
      break;
    }

    const carForward = d.vec2f(std.cos(curAngle), std.sin(curAngle));
    const aheadPos = curPosition + carForward * params.$.sensorDistance;
    const ahead2Pos = curPosition + carForward * params.$.sensorDistance * 2;
    const trackAtPosition = sampleTrackNearest(curPosition);
    const trackAhead = sampleTrackNearest(aheadPos);
    const trackAheadFar = sampleTrackNearest(ahead2Pos);

    const inputsA = d.vec4f(
      senseRaycast(curPosition, curAngle, DEG_60),
      senseRaycast(curPosition, curAngle, DEG_30),
      senseRaycast(curPosition, curAngle, 0),
      senseRaycast(curPosition, curAngle, -DEG_30),
    );
    const inputsB = d.vec4f(
      senseRaycast(curPosition, curAngle, -DEG_60),
      curSpeed / params.$.maxSpeed,
      std.dot(carForward, trackAtPosition.xy),
      trackCross(carForward, trackAhead),
    );
    const inputsC = d.vec4f(
      curAngVel / params.$.turnRate,
      senseRaycast(curPosition, curAngle, DEG_90),
      senseRaycast(curPosition, curAngle, -DEG_90),
      trackCross(carForward, trackAheadFar),
    );

    const control = evalNetwork(genome, inputsA, inputsB, inputsC);
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
    const trackAtEnd = sampleTrackNearest(position);
    const onTrack =
      stallSteps < 120 &&
      trackAtEnd.z > 0.5 &&
      isOnTrack(curPosition + stepVec * 0.33) &&
      isOnTrack(curPosition + stepVec * 0.66);

    const alive = std.select(d.u32(0), d.u32(1), onTrack);
    const forward = std.dot(dir, trackAtEnd.xy);
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

    if (isChampion && curAlive === 1) {
      const hasPrev = trailCount > 0;
      let prevPoint = RacingLinePoint({
        position: curPosition,
        speed: curSpeed,
        drive: 0,
        brake: 0,
        turn: 0,
      });

      if (hasPrev) {
        const prevIndex = std.select(trailCursor - 1, trailCapacity - 1, trailCursor === 0);
        prevPoint = RacingLinePoint(simLayout.$.trail[prevIndex]);
      }

      const detailT = std.clamp(std.abs(steer) + std.max(-throttle, 0) * 0.85, 0, 1);
      const minSpacing =
        params.$.carSize * std.mix(0.18, 0.3, normSpeed) * std.mix(1, 0.52, detailT);
      const delta = curPosition - prevPoint.position;

      if (!hasPrev || std.dot(delta, delta) > minSpacing * minSpacing) {
        let driveSignal = std.clamp(std.max(throttle, 0) * std.mix(0.72, 1, normSpeed), 0, 1);
        let brakeSignal = std.clamp(
          std.max(
            std.max(-throttle, 0) * 0.9,
            (std.max(curSpeed - speed, 0) / std.max(params.$.maxSpeed * params.$.dt, 0.0001)) *
              0.65,
          ),
          0,
          1,
        );
        let turnSignal = std.clamp(std.abs(steer) * std.mix(0.58, 1, normSpeed), 0, 1);

        if (hasPrev) {
          driveSignal = std.mix(prevPoint.drive, driveSignal, 0.24);
          brakeSignal = std.max(brakeSignal, prevPoint.brake * 0.78);
          brakeSignal = std.mix(prevPoint.brake, brakeSignal, 0.42);
          turnSignal = std.mix(prevPoint.turn, turnSignal, 0.3);
        }

        driveSignal = driveSignal * (1 - brakeSignal * 0.72);
        const point = RacingLinePoint({
          position: curPosition,
          speed: curSpeed,
          drive: driveSignal,
          brake: brakeSignal,
          turn: turnSignal,
        });

        simLayout.$.trail[trailCursor] = RacingLinePoint(point);
        simLayout.$.trail[trailCursor + trailCapacity] = RacingLinePoint(point);
        trailCursor = std.select(trailCursor + 1, d.u32(0), trailCursor + 1 >= trailCapacity);
        trailCount = std.min(trailCount + 1, trailCapacity);
        trailPeakSpeed = std.max(trailPeakSpeed, curSpeed);
      }
    }
  }

  simLayout.$.state[index] = CarState({
    position: curPosition,
    angle: curAngle,
    speed: curSpeed,
    alive: curAlive,
    progress: curProgress,
    angVel: curAngVel,
    aliveSteps: curAliveSteps,
    stallSteps: curStallSteps,
  });

  if (isChampion) {
    simLayout.$.trailMeta = RacingLineMeta({
      cursor: trailCursor,
      count: trailCount,
      peakSpeed: trailPeakSpeed,
    });
  }
});

const simulationPasses = simBindGroups.map((bindGroup) => simulatePipeline.with(bindGroup));

const reductionPackedBuffer = root.createBuffer(d.atomic(d.u32), 0).$usage('storage');
const bestFitnessBuffer = root.createBuffer(d.f32).$usage('storage');

const reductionLayout = tgpu.bindGroupLayout({
  fitness: { storage: FitnessArray },
  packed: { storage: d.atomic(d.u32), access: 'mutable' },
  bestIdx: { storage: d.u32, access: 'mutable' },
  bestFitness: { storage: d.f32, access: 'mutable' },
});

const reductionBindGroup = root.createBindGroup(reductionLayout, {
  fitness: ga.fitnessBuffer,
  packed: reductionPackedBuffer,
  bestIdx: ga.bestIdxBuffer,
  bestFitness: bestFitnessBuffer,
});

const reductionPipeline = root.createGuardedComputePipeline((index) => {
  'use gpu';
  if (d.u32(index) >= params.$.population) {
    return;
  }

  const fitness = reductionLayout.$.fitness[index];
  const quantized = d.u32(std.clamp(fitness / 64, 0, 1) * 65535);
  const packed = (quantized << 16) | (d.u32(index) & 0xffff);
  std.atomicMax(reductionLayout.$.packed, packed);
});

const finalizeReductionPipeline = root.createGuardedComputePipeline(() => {
  'use gpu';
  const packed = std.atomicLoad(reductionLayout.$.packed);
  reductionLayout.$.bestIdx = packed & 0xffff;
  reductionLayout.$.bestFitness = (d.f32(packed >> 16) / 65535) * 64;
});

const reductionPass = reductionPipeline.with(reductionBindGroup);
const finalizeReductionPass = finalizeReductionPipeline.with(reductionBindGroup);

const trackColors = {
  grass: tgpu.const(d.vec3f, d.vec3f(0.05, 0.06, 0.08)),
  road: tgpu.const(d.vec3f, d.vec3f(0.14, 0.16, 0.2)),
  paint: tgpu.const(d.vec3f, d.vec3f(0.2, 0.22, 0.3)),
};

const trackFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';
  const position = d.vec2f((uv.x * 2 - 1) * params.$.aspect, 1 - uv.y * 2);
  const sample = sampleTrackLinear(position);

  const mask = sample.z;
  const color = std.mix(trackColors.grass.$, trackColors.road.$, mask);
  const edge = 1 - std.smoothstep(0.6, 0.95, mask);
  const painted = color + trackColors.paint.$ * edge * mask;

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
  const worldPos = rotate(localPos, input.angle) + input.position;
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
  const baseTint = std.mix(d.vec3f(0.4, 0.6, 1), d.vec3f(1, 0.85, 0.15), t);
  const lapAccent = std.smoothstep(1, 10, progress);
  const tint = std.mix(baseTint, d.vec3f(0.15, 1, 0.35), lapAccent);
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

const racingLineRenderLayout = tgpu.bindGroupLayout({
  trail: { storage: RacingLineArray },
  trailMeta: { storage: RacingLineMeta },
});

const racingLineRenderBindGroup = root.createBindGroup(racingLineRenderLayout, {
  trail: racingLineBuffer,
  trailMeta: racingLineMetaBuffer,
});

const racingLineColors = {
  base: tgpu.const(d.vec3f, d.vec3f(0.34, 0.47, 0.54)),
  speed: tgpu.const(d.vec3f, d.vec3f(0.58, 0.74, 0.76)),
  drive: tgpu.const(d.vec3f, d.vec3f(0.47, 0.8, 0.71)),
  brake: tgpu.const(d.vec3f, d.vec3f(0.92, 0.58, 0.47)),
  highlight: tgpu.const(d.vec3f, d.vec3f(0.88, 0.93, 0.95)),
};

const racingLineTint = (action: d.v3f, speedT: number) => {
  'use gpu';
  let color = std.mix(
    racingLineColors.base.$,
    racingLineColors.speed.$,
    std.mix(0.28, 0.7, std.clamp(speedT, 0, 1)) + action.z * 0.12,
  );
  color = std.mix(color, racingLineColors.drive.$, action.x * 0.38);
  color = std.mix(color, racingLineColors.brake.$, action.y * 0.82);
  return color;
};

const racingLineStart = (count: number, cursor: number) => {
  'use gpu';
  return std.select(RACING_LINE_CAPACITY, cursor, count === RACING_LINE_CAPACITY);
};

const racingLinePointAt = (index: number) => {
  'use gpu';
  return RacingLinePoint(racingLineRenderLayout.$.trail[index]);
};

const normalizeOr = (vector: d.v2f, fallback: d.v2f) => {
  'use gpu';
  return std.select(fallback, std.normalize(vector), std.dot(vector, vector) > 0.000001);
};

const racingLineVertex = tgpu.vertexFn({
  in: { vertexIndex: d.builtin.vertexIndex },
  out: {
    pos: d.builtin.position,
    speedT: d.f32,
    age: d.f32,
    side: d.f32,
    action: d.vec3f,
  },
})(({ vertexIndex }) => {
  'use gpu';
  const trailMeta = racingLineRenderLayout.$.trailMeta;
  const count = trailMeta.count;
  const safeCount = std.max(count, 1);
  const lastIndex = safeCount - 1;
  const stripIndex = d.u32(vertexIndex / 2);
  const localIndex = std.min(stripIndex, lastIndex);
  const pointIndex = racingLineStart(count, trailMeta.cursor) + localIndex;
  const point = racingLinePointAt(pointIndex);
  const prevIndex = std.select(pointIndex - 1, pointIndex, localIndex === 0);
  const nextIndex = std.select(pointIndex + 1, pointIndex, localIndex >= lastIndex);
  const tangent = normalizeOr(
    racingLinePointAt(nextIndex).position - racingLinePointAt(prevIndex).position,
    d.vec2f(1, 0),
  );
  const normal = d.vec2f(-tangent.y, tangent.x);
  const peakSpeed = std.max(trailMeta.peakSpeed, 0.0001);
  const speedT = std.clamp(point.speed / peakSpeed, 0, 1);
  const age = d.f32(localIndex) / d.f32(std.max(lastIndex, 1));
  const side = std.select(-1, 1, vertexIndex % 2 === 0);
  const action = d.vec3f(point.drive, point.brake, point.turn);
  const actionT = std.max(action.y, std.max(action.z * 0.75, action.x * 0.3));
  const width = std.select(
    0,
    params.$.carSize * std.mix(0.36, 0.58, speedT) * std.mix(1, 1.48, actionT),
    count > 1 && stripIndex < count,
  );
  const worldPos = point.position + normal * width * side;

  return {
    pos: d.vec4f(worldPos.x / params.$.aspect, worldPos.y, 0, 1),
    speedT,
    age,
    side,
    action,
  };
});

const racingLineFragment = tgpu.fragmentFn({
  in: {
    speedT: d.f32,
    age: d.f32,
    side: d.f32,
    action: d.vec3f,
  },
  out: d.vec4f,
})(({ speedT, age, side, action }) => {
  'use gpu';
  const color = racingLineTint(action, speedT);
  const radius = std.abs(side);
  const glow = 1 - std.smoothstep(0.44, 1.04, radius);
  const core = 1 - std.smoothstep(0.1, 0.8, radius);
  const fade = std.mix(0.5, 0.98, age);
  const actionT = std.max(action.y, std.max(action.z * 0.45, action.x * 0.2));
  const alpha = std.clamp(
    glow * fade * (0.12 + speedT * 0.05) + core * fade * std.mix(0.3, 0.56, actionT),
    0,
    0.9,
  );
  const highlight = std.mix(color, racingLineColors.highlight.$, 0.06 + action.y * 0.12);
  const rgb = color * alpha + highlight * core * fade * 0.08;
  return d.vec4f(rgb, alpha);
});

const racingLinePipeline = root.createRenderPipeline({
  vertex: racingLineVertex,
  fragment: racingLineFragment,
  primitive: { topology: 'triangle-strip' },
  targets: {
    blend: {
      color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    },
  },
});

function clearRacingLine() {
  racingLineMetaBuffer.clear();
}

function clampPopulation(nextPopulation: number): number {
  return Math.max(128, Math.min(MAX_POP, Math.floor(nextPopulation)));
}

function randomTrackSeed(): number {
  return (Math.random() * 100_000) | 0;
}

function scaleSpatialParams(width: number, height: number) {
  const scale = 5 / Math.max(width, height);
  return {
    maxSpeed: BASE_SPATIAL_PARAMS.maxSpeed * scale,
    accel: BASE_SPATIAL_PARAMS.accel * scale,
    turnRate: BASE_SPATIAL_PARAMS.turnRate * scale,
    drag: BASE_SPATIAL_PARAMS.drag * scale,
    sensorDistance: BASE_SPATIAL_PARAMS.sensorDistance * scale,
    carSize: BASE_SPATIAL_PARAMS.carSize * scale,
  };
}

function dispatchSimulationBatch(population: number, dispatchCount: number, stepCount: number) {
  if (dispatchCount <= 0) {
    return;
  }

  params.patch({ stepsPerDispatch: stepCount });

  const encoder = root.device.createCommandEncoder();
  const simulationPass = simulationPasses[ga.current].with(encoder);

  for (let dispatch = 0; dispatch < dispatchCount; dispatch++) {
    simulationPass.dispatchThreads(population);
  }

  root.device.queue.submit([encoder.finish()]);
}

function runSimulationSteps(population: number, totalSteps: number) {
  if (totalSteps <= 0) {
    return;
  }

  const fullDispatches = Math.floor(totalSteps / STEPS_PER_DISPATCH);
  const remainder = totalSteps % STEPS_PER_DISPATCH;

  dispatchSimulationBatch(population, fullDispatches, STEPS_PER_DISPATCH);
  dispatchSimulationBatch(population, remainder > 0 ? 1 : 0, remainder);
}

function finalizeGeneration(population: number) {
  const encoder = root.device.createCommandEncoder();
  encoder.clearBuffer(root.unwrap(reductionPackedBuffer));
  ga.precomputeFitness(population, encoder);
  reductionPass.with(encoder).dispatchThreads(population);
  finalizeReductionPass.with(encoder).dispatchThreads();
  root.device.queue.submit([encoder.finish()]);
}

function renderFrame() {
  trackPipeline.withColorAttachment({ view: context, clearValue: TRACK_CLEAR_COLOR }).draw(3);

  if (showRacingLine) {
    racingLinePipeline
      .with(racingLineRenderBindGroup)
      .withColorAttachment({ view: context, loadOp: 'load', storeOp: 'store' })
      .draw(RACING_LINE_CAPACITY * 2);
  }

  carPipeline
    .withColorAttachment({ view: context, loadOp: 'load', storeOp: 'store' })
    .with(instanceLayout, ga.currentStateBuffer)
    .draw(4, showBestOnly ? 1 : population);
}

let steps = 0;
let stepsPerFrame = STEPS_PER_DISPATCH;
let stepsPerGeneration = 2048;
let paused = false;
let lastAspect = 1;
let population = DEFAULT_POP;
let rafHandle = 0;
let pendingEvolve = false;
let showBestOnly = false;
let showRacingLine = false;
let displayedBestFitness = 0;
let bestFitnessReadPending = false;
let bestFitnessReadEpoch = 0;
let bestFitnessReadDirty = false;
let gridSizeKey: GridSizeKey = 'S';

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
  params.patch({ aspect: nextAspect });
}

function updatePopulation(nextPopulation: number) {
  const clamped = clampPopulation(nextPopulation);
  if (clamped === population) {
    return;
  }

  population = clamped;
  params.patch({ population: clamped });
  ga.reinitCurrent(population);
  clearRacingLine();
}

function requestBestFitnessRead() {
  bestFitnessReadDirty = true;

  if (bestFitnessReadPending) {
    return;
  }

  bestFitnessReadPending = true;
  bestFitnessReadDirty = false;
  const requestEpoch = bestFitnessReadEpoch;

  void bestFitnessBuffer
    .read()
    .then((fitness) => {
      if (requestEpoch === bestFitnessReadEpoch) {
        displayedBestFitness = fitness;
      }
    })
    .finally(() => {
      bestFitnessReadPending = false;

      if (bestFitnessReadDirty) {
        requestBestFitnessRead();
      }
    });
}

function updateStats() {
  const genStr = String(ga.generation).padStart(5);
  const stepStr = String(steps).padStart(String(stepsPerGeneration).length);
  const bestStr = displayedBestFitness.toFixed(2).padStart(6);
  const saturatedNote = displayedBestFitness >= 64 ? '  (saturated)' : '';
  statsDiv.textContent = `Gen ${genStr}  Step ${stepStr}/${stepsPerGeneration}  Pop ${population}  Best ${bestStr}${saturatedNote}`;
}

function frame() {
  updateAspect();

  if (!paused) {
    if (pendingEvolve) {
      ga.evolve(population);
      steps = 0;
      params.patch({ generation: ga.generation });
      pendingEvolve = false;
      clearRacingLine();
    }

    const stepsRemaining = stepsPerGeneration - steps;
    const stepsToRun = Math.min(stepsPerFrame, stepsRemaining);

    if (stepsToRun <= 0) {
      pendingEvolve = true;
    } else {
      runSimulationSteps(population, stepsToRun);
      steps += stepsToRun;
    }

    if (steps >= stepsPerGeneration) {
      pendingEvolve = true;
      finalizeGeneration(population);
      requestBestFitnessRead();
    }
  }

  updateStats();
  renderFrame();
  rafHandle = requestAnimationFrame(frame);
}

function applyTrack(result: TrackResult) {
  trackTexture.write(
    new ImageData(new Uint8ClampedArray(result.data), result.width, result.height),
  );
  params.patch({
    spawnX: result.spawn.position[0],
    spawnY: result.spawn.position[1],
    spawnAngle: result.spawn.angle,
    trackLength: result.trackLength,
  });
}

function applyGridSize(width: number, height: number) {
  params.patch(scaleSpatialParams(width, height));
}

function startSimulation() {
  steps = 0;
  pendingEvolve = false;
  displayedBestFitness = 0;
  bestFitnessReadEpoch++;
  bestFitnessReadDirty = false;
  params.patch({ generation: 0, population });
  ga.init(population);
  clearRacingLine();

  updateAspect();
  cancelAnimationFrame(rafHandle);
  rafHandle = requestAnimationFrame(frame);
}

function buildTrackForCurrentGrid(seed = randomTrackSeed()) {
  const [width, height] = GRID_SIZES[gridSizeKey];
  applyGridSize(width, height);
  applyTrack(generateGridTrack(seed, width, height, TRACK_TEXTURE_SIZE));
}

function newTrack() {
  buildTrackForCurrentGrid();
  startSimulation();
}

buildTrackForCurrentGrid();
startSimulation();

// #region Example controls & Cleanup

export const controls = defineControls({
  'New Track': { onButtonClick: newTrack },
  'Grid size': {
    initial: gridSizeKey,
    options: GRID_SIZE_KEYS,
    onSelectChange: (value: string) => {
      gridSizeKey = value as GridSizeKey;
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
  'Racing line': {
    initial: false,
    onToggleChange: (value: boolean) => {
      showRacingLine = value;
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
    initial: DEFAULT_MUTATION_RATE,
    min: 0,
    max: 0.4,
    step: 0.005,
    onSliderChange: (value: number) => {
      params.patch({ mutationRate: value });
    },
  },
  'Mutation strength': {
    initial: DEFAULT_MUTATION_STRENGTH,
    min: 0.01,
    max: 0.8,
    step: 0.01,
    onSliderChange: (value: number) => {
      params.patch({ mutationStrength: value });
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(rafHandle);
  root.destroy();
}

// #endregion
