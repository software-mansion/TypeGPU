/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('probability distribution plot example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'algorithms',
        name: 'probability',
        controlTriggers: ['Test Resolution'],
        expectedCalls: 13,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randUniformExclusive() -> f32 {
        return ((sample() * 0.9999998f) + 1e-7f);
      }

      fn randNormal(mu: f32, sigma: f32) -> f32 {
        let theta = (6.283185307179586f * randUniformExclusive());
        let R = sqrt((-2f * log(randUniformExclusive())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere() -> vec3f {
        let u = sample();
        let v = vec3f(randNormal(0f, 1f), randNormal(0f, 1f), randNormal(0f, 1f));
        let vNorm = normalize(v);
        return (vNorm * pow(u, 0.33f));
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = randInUnitSphere();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randOnUnitSphere() -> vec3f {
        let z = ((2f * sample()) - 1f);
        let oneMinusZSq = sqrt((1f - (z * z)));
        let theta = (6.283185307179586f * sample());
        let x = (cos(theta) * oneMinusZSq);
        let y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = randOnUnitSphere();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randInUnitCircle() -> vec2f {
        let radius = sqrt(sample());
        let angle = (sample() * 6.283185307179586f);
        return vec2f((cos(angle) * radius), (sin(angle) * radius));
      }

      fn prng() -> vec3f {
        return vec3f(randInUnitCircle(), 0.5f);
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randOnUnitCircle() -> vec2f {
        let angle = (sample() * 6.283185307179586f);
        return vec2f(cos(angle), sin(angle));
      }

      fn prng() -> vec3f {
        return vec3f(randOnUnitCircle(), 0.5f);
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randInUnitCube() -> vec3f {
        return vec3f(sample(), sample(), sample());
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = randInUnitCube();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randOnUnitCube() -> vec3f {
        let face = u32((sample() * 6f));
        let axis = (face % 3u);
        var result = vec3f();
        result[axis] = f32(select(0i, 1i, (face > 2u)));
        result[((axis + 1u) % 3u)] = sample();
        result[((axis + 2u) % 3u)] = sample();
        return result;
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = randOnUnitCube();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randUniformExclusive() -> f32 {
        return ((sample() * 0.9999998f) + 1e-7f);
      }

      fn randNormal(mu: f32, sigma: f32) -> f32 {
        let theta = (6.283185307179586f * randUniformExclusive());
        let R = sqrt((-2f * log(randUniformExclusive())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere() -> vec3f {
        let u = sample();
        let v = vec3f(randNormal(0f, 1f), randNormal(0f, 1f), randNormal(0f, 1f));
        let vNorm = normalize(v);
        return (vNorm * pow(u, 0.33f));
      }

      fn randInUnitHemisphere(normal: vec3f) -> vec3f {
        let value = randInUnitSphere();
        let alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng() -> vec3f {
        return randInUnitHemisphere(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randOnUnitSphere() -> vec3f {
        let z = ((2f * sample()) - 1f);
        let oneMinusZSq = sqrt((1f - (z * z)));
        let theta = (6.283185307179586f * sample());
        let x = (cos(theta) * oneMinusZSq);
        let y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn randOnUnitHemisphere(normal: vec3f) -> vec3f {
        let value = randOnUnitSphere();
        let alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng() -> vec3f {
        return randOnUnitHemisphere(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randBernoulli(p: f32) -> f32 {
        let u = sample();
        return step(u, p);
      }

      fn prng() -> vec3f {
        return vec3f(randBernoulli(0.7f));
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      fn prng() -> vec3f {
        return vec3f(randFloat01());
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randUniformExclusive() -> f32 {
        return ((sample() * 0.9999998f) + 1e-7f);
      }

      fn randExponential(rate: f32) -> f32 {
        let u = randUniformExclusive();
        return ((-1f / rate) * log(u));
      }

      fn prng() -> vec3f {
        return vec3f(randExponential(1f));
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randUniformExclusive() -> f32 {
        return ((sample() * 0.9999998f) + 1e-7f);
      }

      fn randNormal(mu: f32, sigma: f32) -> f32 {
        let theta = (6.283185307179586f * randUniformExclusive());
        let R = sqrt((-2f * log(randUniformExclusive())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn prng() -> vec3f {
        return vec3f(randNormal(0f, 1f));
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      fn hash(value: u32) -> u32 {
        {
          var x = (value ^ (value >> 17u));
          x *= 3982152891u;
          x ^= (x >> 11u);
          x *= 2890668881u;
          x ^= (x >> 15u);
          x *= 830770091u;
          x ^= (x >> 14u);
          return x;
        }
      }

      fn scrambleSeed(value: f32) -> u32 {
        return hash((bitcast<u32>(value) ^ 1253408251u));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed_1(value: f32) {
        let scrambled = scrambleSeed(value);
        let newSeed = vec2u(hash(scrambled), hash(rotl(scrambled, 16u)));
        gpuSeed = newSeed;
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn next() -> u32 {
        {
          let s0 = gpuSeed[0i];
          var s1 = gpuSeed[1i];
          s1 ^= s0;
          gpuSeed[0i] = ((rotl(s0, 26u) ^ s1) ^ (s1 << 9u));
          gpuSeed[1i] = rotl(s1, 13u);
          return (rotl((gpuSeed[0i] * 2654435771u), 5u) * 5u);
        }
      }

      fn u32To01F32(value: u32) -> f32 {
        let mantissa = (value & 8388607u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        let r = next();
        return u32To01F32(r);
      }

      fn randUniformExclusive() -> f32 {
        return ((sample() * 0.9999998f) + 1e-7f);
      }

      fn randCauchy(x0: f32, gamma: f32) -> f32 {
        let u = randUniformExclusive();
        return (x0 + (gamma * tan((3.141592653589793f * (u - 0.5f)))));
      }

      fn prng() -> vec3f {
        return vec3f(randCauchy(0f, 1f));
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(@builtin(global_invocation_id) gid: vec3u) {
        let id = gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }"
    `);
  });
});
