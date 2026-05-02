import tgpu, { d, std } from 'typegpu';
import { perlin3d, randomGeneratorSlot, XOROSHIRO64STARSTAR } from '@typegpu/noise';
import { cos, dot, floor, mix, sin, sqrt } from 'typegpu/std';

const root = await tgpu.init();

const TWO_PI = d.f32(d.f32(Math.PI) * d.f32(2));
let seed: d.v2u;

const rotl = (x: number, k: number) => {
  return (x << k) | (x >>> (32 - k));
};

const next = () => {
  const s0 = seed[0];
  let s1 = seed[1];
  s1 ^= s0;
  seed[0] = rotl(s0, 26) ^ s1 ^ (s1 << 9);
  seed[1] = rotl(s1, 13);
  const temp = Math.imul(seed[0], 0x9e3779bb);
  return Math.imul(rotl(temp, 5), 5);
};

const hash = (value: number) => {
  let x = value ^ (value >>> 17);
  x = Math.imul(x, 0xed5ad4bb);
  x = x ^ (x >>> 11);
  x = Math.imul(x, 0xac4c1b51);
  x = x ^ (x >>> 15);
  x = Math.imul(x, 0x31848bab);
  x = x ^ (x >>> 14);
  return x;
};

function randSeed3(value: d.v3f) {
  const dataView = new DataView(new ArrayBuffer(12));
  dataView.setFloat32(0, value.x, true);
  dataView.setFloat32(4, value.y, true);
  dataView.setFloat32(8, value.z, true);
  const x = dataView.getUint32(0, true);
  const y = dataView.getUint32(4, true);
  const z = dataView.getUint32(8, true);
  const hx = hash(x ^ 0x4ab57dfb);
  const hy = hash(y ^ 0xacdeda47);
  const hz = hash(z ^ 0xbca0294b);
  seed = d.vec2u(hash(hx ^ rotl(hz, 16)), hash(rotl(hy, 16) ^ hz));
}

function randomGeneratorShell() {
  const r = next();
  const mantissa = r & 0x007fffff;
  const bits = 0x3f800000 | mantissa;
  const dataView = new DataView(new ArrayBuffer(4));
  dataView.setUint32(0, bits, true);
  return dataView.getFloat32(0, true) - 1;
}

function randOnUnitSphere() {
  const z = d.f32(d.f32(d.f32(2) * d.f32(randomGeneratorShell())) - d.f32(1));
  const oneMinusZSq = d.f32(sqrt(d.f32(d.f32(1) - d.f32(z * z))));
  const theta = d.f32(TWO_PI * d.f32(randomGeneratorShell()));
  const x = d.f32(d.f32(cos(theta)) * oneMinusZSq);
  const y = d.f32(d.f32(sin(theta)) * oneMinusZSq);

  return d.vec3f(x, y, z);
}

export function computeJunctionGradient(pos: d.v3i) {
  'use gpu';
  randSeed3(0.001 * d.vec3f(pos));
  return randOnUnitSphere();
}

function dotProdGrid(pos: d.v3f, junction: d.v3f) {
  'use gpu';
  const relative = pos - junction;
  const gridVector = computeJunctionGradient(d.vec3i(junction));
  return d.f32(dot(relative, gridVector));
}

function quinticInterpolation(t: d.v3f) {
  'use gpu';
  return t * t * t * (t * (t * 6 - 15) + 10);
}

export function sample(pos: d.v3f) {
  'use gpu';
  const minJunction = floor(pos);

  const xyz = dotProdGrid(pos, minJunction);
  const xyZ = dotProdGrid(pos, minJunction + d.vec3f(0, 0, 1));
  const xYz = dotProdGrid(pos, minJunction + d.vec3f(0, 1, 0));
  const xYZ = dotProdGrid(pos, minJunction + d.vec3f(0, 1, 1));
  const Xyz = dotProdGrid(pos, minJunction + d.vec3f(1, 0, 0));
  const XyZ = dotProdGrid(pos, minJunction + d.vec3f(1, 0, 1));
  const XYz = dotProdGrid(pos, minJunction + d.vec3f(1, 1, 0));
  const XYZ = dotProdGrid(pos, minJunction + d.vec3f(1, 1, 1));

  const partial = pos - minJunction;
  const smoothPartial = quinticInterpolation(partial);

  // Resolving the z-axis into a xy-slice
  const xy = mix(xyz, xyZ, smoothPartial.z);
  const xY = mix(xYz, xYZ, smoothPartial.z);
  const Xy = mix(Xyz, XyZ, smoothPartial.z);
  const XY = mix(XYz, XYZ, smoothPartial.z);

  // Merging the y-axis
  const x = mix(xy, xY, smoothPartial.y);
  const X = mix(Xy, XY, smoothPartial.y);

  return mix(x, X, smoothPartial.x);
}

const SAMPLES = 100;

const cpuBuffer = new Float32Array(SAMPLES);
for (let i = 1; i <= SAMPLES; i++) {
  const pointInWorld = d.vec3f(i ** 2, i, 1 / i);
  const direction = pointInWorld;
  const normalizedDirection = std.normalize(direction);

  const perlinValue = sample(normalizedDirection);
  cpuBuffer[i - 1] = perlinValue;
}

const gpuBuffer = root.createMutable(d.arrayOf(d.f32, SAMPLES));
const f = root.with(randomGeneratorSlot, XOROSHIRO64STARSTAR).createGuardedComputePipeline(() => {
  'use gpu';
  for (let i = 1; i <= SAMPLES; i++) {
    const pointInWorld = d.vec3f(d.f32(i) ** 2, i, 1 / d.f32(i));
    const direction = pointInWorld;
    const normalizedDirection = std.normalize(direction);

    const perlinValue = perlin3d.sample(normalizedDirection);
    gpuBuffer.$[i - 1] = perlinValue;
  }
});
f.dispatchThreads();
const gpuReadBuffer = new Float32Array(await gpuBuffer.read());
for (let i = 1; i <= SAMPLES; i++) {
  console.log(
    'cpu vs gpu perlin abs diff',
    Math.abs(cpuBuffer[i - 1] - gpuReadBuffer[i - 1]).toFixed(8), // one more than f32 precision
  );
}

// #region Example controls and cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
