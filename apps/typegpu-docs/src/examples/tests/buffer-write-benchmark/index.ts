import tgpu, { d } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();

const N_VECS = 2_000;
const N_STRUCTS = 100;
const N_BOIDS = 500;

// Particle: pos(+0,12)+vel(+16,12)+health(+28,4)+forces(+32,2048) = 2080 bytes
const Particle = d.struct({
  position: d.vec3f,
  velocity: d.vec3f,
  health: d.f32,
  forces: d.arrayOf(d.vec3f, 128),
});
const PARTICLE_FLOATS = d.sizeOf(Particle) / 4; // 520

// Transform: pos(+0,12)+rot(+16,16)+scale(+32,12) = 40 bytes + 8 padding = 48 bytes
const Transform = d.struct({ position: d.vec3f, rotation: d.vec4f, scale: d.vec3f });
// Boid: transform(+0,48)+velocity(+48,12)+neighbors(+64,64)+health(+128,4) = 132 bytes + 12 padding = 144 bytes
const Boid = d.struct({
  transform: Transform,
  velocity: d.vec3f,
  neighbors: d.arrayOf(d.vec3f, 4),
  health: d.f32,
});
const BOID_FLOATS = d.sizeOf(Boid) / 4; // 36

const schemaVec3 = d.arrayOf(d.vec3f, N_VECS);
const schemaParticle = d.arrayOf(Particle, N_STRUCTS);
const schemaBoid = d.arrayOf(Boid, N_BOIDS);

const bufVec3 = root.createBuffer(schemaVec3);
const bufParticle = root.createBuffer(schemaParticle);
const bufBoid = root.createBuffer(schemaBoid);

// vec3f

const vec3Instances = Array.from({ length: N_VECS }, (_, i) =>
  d.vec3f(i * 0.001, i * 0.001, i * 0.001),
);
const vec3Tuples = Array.from({ length: N_VECS }, (_, i) => [
  i * 0.001,
  i * 0.001,
  i * 0.001,
]) as d.InferInput<typeof schemaVec3>;

const vec3TypedArray = new Float32Array(N_VECS * 4);
for (let i = 0; i < N_VECS; i++) {
  vec3TypedArray[i * 4 + 0] = i * 0.001;
  vec3TypedArray[i * 4 + 1] = i * 0.001;
  vec3TypedArray[i * 4 + 2] = i * 0.001;
  // vec3TypedArray[i * 4 + 3] = 0; // padding
}
const vec3ArrayBuffer = vec3TypedArray.buffer;

// Particle

const particleInstances = Array.from({ length: N_STRUCTS }, (_, i) => ({
  position: d.vec3f(i * 0.001, 0, 0),
  velocity: d.vec3f(0, 0, 0),
  health: 100,
  forces: Array.from({ length: 128 }, () => d.vec3f()),
}));
const particleTuples = Array.from({ length: N_STRUCTS }, (_, i) => ({
  position: [i * 0.001, 0, 0],
  velocity: [0, 0, 0],
  health: 100,
  forces: Array.from({ length: 128 }, () => [0, 0, 0]),
})) as d.InferInput<typeof schemaParticle>;

const particleForcesTyped = new Float32Array(128 * 4);
const particleMixed = Array.from({ length: N_STRUCTS }, (_, i) => ({
  position: [i * 0.001, 0, 0],
  velocity: [0, 0, 0],
  health: 100,
  forces: particleForcesTyped,
})) as d.InferInput<typeof schemaParticle>;

const particleArrayBuffer = new ArrayBuffer(N_STRUCTS * d.sizeOf(Particle));
const particleArrayBufferView = new Float32Array(particleArrayBuffer);
for (let i = 0; i < N_STRUCTS; i++) {
  particleArrayBufferView[i * PARTICLE_FLOATS + 0] = i * 0.001; // position.x
  particleArrayBufferView[i * PARTICLE_FLOATS + 7] = 100; // health
}

// Boid

const boidInstances = Array.from({ length: N_BOIDS }, (_, i) => ({
  transform: {
    position: d.vec3f(i * 0.001, 0, 0),
    rotation: d.vec4f(0, 0, 0, 1),
    scale: d.vec3f(1, 1, 1),
  },
  velocity: d.vec3f(0.1, 0, 0),
  neighbors: [d.vec3f(), d.vec3f(), d.vec3f(), d.vec3f()],
  health: 100,
}));
const boidTuples = Array.from({ length: N_BOIDS }, (_, i) => ({
  transform: { position: [i * 0.001, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  velocity: [0.1, 0, 0],
  neighbors: [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ],
  health: 100,
})) as d.InferInput<typeof schemaBoid>;

const boidNeighborsTyped = new Float32Array(4 * 4);
const boidMixed = Array.from({ length: N_BOIDS }, (_, i) => ({
  transform: { position: [i * 0.001, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
  velocity: [0.1, 0, 0],
  neighbors: boidNeighborsTyped,
  health: 100,
})) as d.InferInput<typeof schemaBoid>;

const boidArrayBuffer = new ArrayBuffer(N_BOIDS * d.sizeOf(Boid));
const boidArrayBufferView = new Float32Array(boidArrayBuffer);
for (let i = 0; i < N_BOIDS; i++) {
  const b = i * BOID_FLOATS;
  boidArrayBufferView[b + 0] = i * 0.001; // transform.position.x
  boidArrayBufferView[b + 7] = 1; // transform.rotation.w
  boidArrayBufferView[b + 8] = 1; // transform.scale.x
  boidArrayBufferView[b + 9] = 1; // transform.scale.y
  boidArrayBufferView[b + 10] = 1; // transform.scale.z
  boidArrayBufferView[b + 12] = 0.1; // velocity.x
  boidArrayBufferView[b + 32] = 100; // health
}

// Benchmark helpers

function bench(fn: () => void, iters: number): number {
  const warmup = Math.ceil(iters / 10);
  for (let i = 0; i < warmup; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iters; i++) fn();
  return (performance.now() - t0) / iters;
}

function compareMulti(
  label: string,
  byteSize: number,
  iters: number,
  cases: Array<[string, () => void]>,
): void {
  const results = cases.map(([name, fn]) => ({ name, ms: bench(fn, iters) }));
  const kb = (byteSize / 1024).toFixed(0);
  const lines = [`${label}  (${kb} KB/write, ${iters} iters)`];
  for (const { name, ms } of results) {
    lines.push(`  ${name}: ${ms.toFixed(4)} ms/iter`);
  }
  console.log(lines.join('\n'));
}

// Runners

function runVec3() {
  compareMulti('arrayOf(vec3f, 2000)', d.sizeOf(schemaVec3), 500, [
    [
      '1. vec instances',
      () => {
        bufVec3.write(vec3Instances);
      },
    ],
    [
      '2. plain tuples ',
      () => {
        bufVec3.write(vec3Tuples);
      },
    ],
    [
      '3. Float32Array ',
      () => {
        bufVec3.write(vec3TypedArray);
      },
    ],
    [
      '4. ArrayBuffer  ',
      () => {
        bufVec3.write(vec3ArrayBuffer);
      },
    ],
  ]);
}

function runParticle() {
  compareMulti(
    'arrayOf(Particle, 100)  struct with 128-elem array field',
    d.sizeOf(schemaParticle),
    200,
    [
      [
        '1. vec instances       ',
        () => {
          bufParticle.write(particleInstances);
        },
      ],
      [
        '2. plain tuples        ',
        () => {
          bufParticle.write(particleTuples);
        },
      ],
      [
        '3. mixed forces=TA     ',
        () => {
          bufParticle.write(particleMixed);
        },
      ],
      [
        '4. ArrayBuffer         ',
        () => {
          bufParticle.write(particleArrayBuffer);
        },
      ],
    ],
  );
}

function runBoid() {
  compareMulti('arrayOf(Boid, 500)  nested struct with array field', d.sizeOf(schemaBoid), 200, [
    [
      '1. vec instances       ',
      () => {
        bufBoid.write(boidInstances);
      },
    ],
    [
      '2. plain tuples        ',
      () => {
        bufBoid.write(boidTuples);
      },
    ],
    [
      '3. mixed neighbors=TA  ',
      () => {
        bufBoid.write(boidMixed);
      },
    ],
    [
      '4. ArrayBuffer         ',
      () => {
        bufBoid.write(boidArrayBuffer);
      },
    ],
  ]);
}

export const controls = defineControls({
  'arrayOf(vec3f, 2000)': {
    onButtonClick: runVec3,
  },
  'arrayOf(Particle, 100)': {
    onButtonClick: runParticle,
  },
  'arrayOf(Boid, 500)': {
    onButtonClick: runBoid,
  },
  'Run all': {
    onButtonClick: () => {
      runVec3();
      runParticle();
      runBoid();
    },
  },
});

export function onCleanup() {
  root.destroy();
}
