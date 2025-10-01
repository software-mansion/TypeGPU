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
      "@group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_7() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_7() * 0.9999998) + 1e-7);
      }

      fn randNormal_8(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_9());
        var R = sqrt((-2 * log(randUniformExclusive_9())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_6() -> vec3f {
        var u = item_7();
        var v = vec3f(randNormal_8(0, 1), randNormal_8(0, 1), randNormal_8(0, 1));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33));
      }

      struct item_10 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_10) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = randInUnitSphere_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_7() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randOnUnitSphere_6() -> vec3f {
        var z = ((2 * item_7()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_7());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      struct item_8 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_8) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = randOnUnitSphere_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randInUnitCircle_7() -> vec2f {
        var radius = sqrt(item_8());
        var angle = (item_8() * 6.283185307179586);
        return vec2f((cos(angle) * radius), (sin(angle) * radius));
      }

      fn prng_6() -> vec3f {
        return vec3f(randInUnitCircle_7(), 0.5);
      }

      struct item_9 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_9) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = prng_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randOnUnitCircle_7() -> vec2f {
        var angle = (item_8() * 6.283185307179586);
        return vec2f(cos(angle), sin(angle));
      }

      fn prng_6() -> vec3f {
        return vec3f(randOnUnitCircle_7(), 0.5);
      }

      struct item_9 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_9) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = prng_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_7() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randInUnitCube_6() -> vec3f {
        return vec3f(item_7(), item_7(), item_7());
      }

      struct item_8 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_8) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = randInUnitCube_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_7() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randOnUnitCube_6() -> vec3f {
        var face = u32((item_7() * 6));
        var axis = (face % 3);
        var result = vec3f();
        result[axis] = f32(select(0, 1, (face > 2)));
        result[((axis + 1) % 3)] = item_7();
        result[((axis + 2) % 3)] = item_7();
        return result;
      }

      struct item_8 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_8) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = randOnUnitCube_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randUniformExclusive_11() -> f32 {
        return ((item_9() * 0.9999998) + 1e-7);
      }

      fn randNormal_10(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_11());
        var R = sqrt((-2 * log(randUniformExclusive_11())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_8() -> vec3f {
        var u = item_9();
        var v = vec3f(randNormal_10(0, 1), randNormal_10(0, 1), randNormal_10(0, 1));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33));
      }

      fn randInUnitHemisphere_7(normal: vec3f) -> vec3f {
        var value = randInUnitSphere_8();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng_6() -> vec3f {
        return randInUnitHemisphere_7(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      struct item_12 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_12) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = prng_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randOnUnitSphere_8() -> vec3f {
        var z = ((2 * item_9()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_9());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn randOnUnitHemisphere_7(normal: vec3f) -> vec3f {
        var value = randOnUnitSphere_8();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng_6() -> vec3f {
        return randOnUnitHemisphere_7(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      struct item_10 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_10) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = prng_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randBernoulli_7(p: f32) -> f32 {
        var u = item_8();
        return step(u, p);
      }

      fn prng_6() -> vec3f {
        return vec3f(randBernoulli_7(0.7));
      }

      struct item_9 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_9) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = prng_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randFloat01_7() -> f32 {
        return item_8();
      }

      fn prng_6() -> vec3f {
        return vec3f(randFloat01_7());
      }

      struct item_9 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_9) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = prng_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randUniformExclusive_8() -> f32 {
        return ((item_9() * 0.9999998) + 1e-7);
      }

      fn randExponential_7(rate: f32) -> f32 {
        var u = randUniformExclusive_8();
        return ((-1 / rate) * log(u));
      }

      fn prng_6() -> vec3f {
        return vec3f(randExponential_7(1));
      }

      struct item_10 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_10) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = prng_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randUniformExclusive_8() -> f32 {
        return ((item_9() * 0.9999998) + 1e-7);
      }

      fn randNormal_7(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_8());
        var R = sqrt((-2 * log(randUniformExclusive_8())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn prng_6() -> vec3f {
        return vec3f(randNormal_7(0, 1));
      }

      struct item_10 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_10) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = prng_6();
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_1: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_2: array<f32>;

      var<private> seed_5: vec2f;

      fn seed_4(value: f32) {
        seed_5 = vec2f(value, 0);
      }

      fn randSeed_3(seed: f32) {
        seed_4(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_5, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_5, vec2f(54.47856521606445, 345.8415222167969));
        seed_5.x = fract((cos(a) * 136.8168));
        seed_5.y = fract((cos(b) * 534.7645));
        return seed_5.y;
      }

      fn randUniformExclusive_8() -> f32 {
        return ((item_9() * 0.9999998) + 1e-7);
      }

      fn randCauchy_7(x0: f32, gamma: f32) -> f32 {
        var u = randUniformExclusive_8();
        return (x0 + (gamma * tan((3.141592653589793 * (u - 0.5)))));
      }

      fn prng_6() -> vec3f {
        return vec3f(randCauchy_7(0, 1));
      }

      struct item_10 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(64) fn item_0(input: item_10) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_1))) {
          return;
        }
        randSeed_3(seedBuffer_2[id]);
        samplesBuffer_1[id] = prng_6();
      }"
    `);
  });
});
