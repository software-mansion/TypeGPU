/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('probability distribution plot example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'algorithms',
      name: 'probability',
      controlTriggers: ['Test Resolution'],
      expectedCalls: 13,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randUniformExclusive() -> f32 {
        return ((item() * 0.9999998f) + 1e-7f);
      }

      fn randNormal(mu: f32, sigma: f32) -> f32 {
        let theta = (6.283185307179586f * randUniformExclusive());
        let R = sqrt((-2f * log(randUniformExclusive())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere() -> vec3f {
        let u = item();
        var v = vec3f(randNormal(0f, 1f), randNormal(0f, 1f), randNormal(0f, 1f));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33f));
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = randInUnitSphere();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randOnUnitSphere() -> vec3f {
        let z = ((2f * item()) - 1f);
        let oneMinusZSq = sqrt((1f - (z * z)));
        let theta = (6.283185307179586f * item());
        let x = (cos(theta) * oneMinusZSq);
        let y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = randOnUnitSphere();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randInUnitCircle() -> vec2f {
        let radius = sqrt(item());
        let angle = (item() * 6.283185307179586f);
        return vec2f((cos(angle) * radius), (sin(angle) * radius));
      }

      fn prng() -> vec3f {
        return vec3f(randInUnitCircle(), 0.5f);
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randOnUnitCircle() -> vec2f {
        let angle = (item() * 6.283185307179586f);
        return vec2f(cos(angle), sin(angle));
      }

      fn prng() -> vec3f {
        return vec3f(randOnUnitCircle(), 0.5f);
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randInUnitCube() -> vec3f {
        return vec3f(item(), item(), item());
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = randInUnitCube();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randOnUnitCube() -> vec3f {
        let face = u32((item() * 6f));
        let axis = (face % 3u);
        var result = vec3f();
        result[axis] = f32(select(0, 1, (face > 2u)));
        result[((axis + 1u) % 3u)] = item();
        result[((axis + 2u) % 3u)] = item();
        return result;
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = randOnUnitCube();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randUniformExclusive() -> f32 {
        return ((item() * 0.9999998f) + 1e-7f);
      }

      fn randNormal(mu: f32, sigma: f32) -> f32 {
        let theta = (6.283185307179586f * randUniformExclusive());
        let R = sqrt((-2f * log(randUniformExclusive())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere() -> vec3f {
        let u = item();
        var v = vec3f(randNormal(0f, 1f), randNormal(0f, 1f), randNormal(0f, 1f));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33f));
      }

      fn randInUnitHemisphere(normal: vec3f) -> vec3f {
        var value = randInUnitSphere();
        let alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng() -> vec3f {
        return randInUnitHemisphere(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randOnUnitSphere() -> vec3f {
        let z = ((2f * item()) - 1f);
        let oneMinusZSq = sqrt((1f - (z * z)));
        let theta = (6.283185307179586f * item());
        let x = (cos(theta) * oneMinusZSq);
        let y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn randOnUnitHemisphere(normal: vec3f) -> vec3f {
        var value = randOnUnitSphere();
        let alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng() -> vec3f {
        return randOnUnitHemisphere(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randBernoulli(p: f32) -> f32 {
        let u = item();
        return step(u, p);
      }

      fn prng() -> vec3f {
        return vec3f(randBernoulli(0.7f));
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return item();
      }

      fn prng() -> vec3f {
        return vec3f(randFloat01());
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randUniformExclusive() -> f32 {
        return ((item() * 0.9999998f) + 1e-7f);
      }

      fn randExponential(rate: f32) -> f32 {
        let u = randUniformExclusive();
        return ((-1f / rate) * log(u));
      }

      fn prng() -> vec3f {
        return vec3f(randExponential(1f));
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randUniformExclusive() -> f32 {
        return ((item() * 0.9999998f) + 1e-7f);
      }

      fn randNormal(mu: f32, sigma: f32) -> f32 {
        let theta = (6.283185307179586f * randUniformExclusive());
        let R = sqrt((-2f * log(randUniformExclusive())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn prng() -> vec3f {
        return vec3f(randNormal(0f, 1f));
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer: array<f32>;

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn item() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randUniformExclusive() -> f32 {
        return ((item() * 0.9999998f) + 1e-7f);
      }

      fn randCauchy(x0: f32, gamma: f32) -> f32 {
        let u = randUniformExclusive();
        return (x0 + (gamma * tan((3.141592653589793f * (u - 0.5f)))));
      }

      fn prng() -> vec3f {
        return vec3f(randCauchy(0f, 1f));
      }

      struct dataMoreWorkersFunc_Input {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn dataMoreWorkersFunc(input: dataMoreWorkersFunc_Input) {
        let id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer))) {
          return;
        }
        randSeed(seedBuffer[id]);
        samplesBuffer[id] = prng();
      }"
    `);
  });
});
