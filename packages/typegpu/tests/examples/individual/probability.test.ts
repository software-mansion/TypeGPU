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
      category: 'simple',
      name: 'probability',
      controlTriggers: ['Test Resolution'],
      expectedCalls: 39,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_10() -> f32 {
        return ((item_8() * 0.9999998) + 1e-7);
      }

      fn randNormal_9(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_10());
        var R = sqrt((-2 * log(randUniformExclusive_10())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_7() -> vec3f {
        var u = item_8();
        var v = vec3f(randNormal_9(0, 1), randNormal_9(0, 1), randNormal_9(0, 1));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randInUnitSphere_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_10() -> f32 {
        return ((item_8() * 0.9999998) + 1e-7);
      }

      fn randNormal_9(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_10());
        var R = sqrt((-2 * log(randUniformExclusive_10())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_7() -> vec3f {
        var u = item_8();
        var v = vec3f(randNormal_9(0, 1), randNormal_9(0, 1), randNormal_9(0, 1));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randInUnitSphere_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_9(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_8() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_9(seed_6);
      }

      fn randUniformExclusive_11() -> f32 {
        return ((item_8() * 0.9999998) + 1e-7);
      }

      fn randNormal_10(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_11());
        var R = sqrt((-2 * log(randUniformExclusive_11())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_7() -> vec3f {
        var u = item_8();
        var v = vec3f(randNormal_10(0, 1), randNormal_10(0, 1), randNormal_10(0, 1));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randInUnitSphere_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randOnUnitSphere_7() -> vec3f {
        var z = ((2 * item_8()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_8());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randOnUnitSphere_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randOnUnitSphere_7() -> vec3f {
        var z = ((2 * item_8()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_8());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randOnUnitSphere_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_9(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_8() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_9(seed_6);
      }

      fn randOnUnitSphere_7() -> vec3f {
        var z = ((2 * item_8()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_8());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randOnUnitSphere_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randInUnitCircle_8() -> vec2f {
        var radius = sqrt(item_9());
        var angle = (item_9() * 6.283185307179586);
        return vec2f((cos(angle) * radius), (sin(angle) * radius));
      }

      fn prng_7() -> vec3f {
        return vec3f(randInUnitCircle_8(), 0.5);
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randInUnitCircle_8() -> vec2f {
        var radius = sqrt(item_9());
        var angle = (item_9() * 6.283185307179586);
        return vec2f((cos(angle) * radius), (sin(angle) * radius));
      }

      fn prng_7() -> vec3f {
        return vec3f(randInUnitCircle_8(), 0.5);
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_10(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_9() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_10(seed_6);
      }

      fn randInUnitCircle_8() -> vec2f {
        var radius = sqrt(item_9());
        var angle = (item_9() * 6.283185307179586);
        return vec2f((cos(angle) * radius), (sin(angle) * radius));
      }

      fn prng_7() -> vec3f {
        return vec3f(randInUnitCircle_8(), 0.5);
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randOnUnitCircle_8() -> vec2f {
        var angle = (item_9() * 6.283185307179586);
        return vec2f(cos(angle), sin(angle));
      }

      fn prng_7() -> vec3f {
        return vec3f(randOnUnitCircle_8(), 0.5);
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randOnUnitCircle_8() -> vec2f {
        var angle = (item_9() * 6.283185307179586);
        return vec2f(cos(angle), sin(angle));
      }

      fn prng_7() -> vec3f {
        return vec3f(randOnUnitCircle_8(), 0.5);
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_10(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_9() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_10(seed_6);
      }

      fn randOnUnitCircle_8() -> vec2f {
        var angle = (item_9() * 6.283185307179586);
        return vec2f(cos(angle), sin(angle));
      }

      fn prng_7() -> vec3f {
        return vec3f(randOnUnitCircle_8(), 0.5);
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randInUnitCube_7() -> vec3f {
        return vec3f(item_8(), item_8(), item_8());
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randInUnitCube_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randInUnitCube_7() -> vec3f {
        return vec3f(item_8(), item_8(), item_8());
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randInUnitCube_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_9(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_8() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_9(seed_6);
      }

      fn randInUnitCube_7() -> vec3f {
        return vec3f(item_8(), item_8(), item_8());
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randInUnitCube_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randOnUnitCube_7() -> vec3f {
        var face = u32((item_8() * 6));
        var axis = (face % 3);
        var result = vec3f();
        result[axis] = f32(select(0, 1, (face > 2)));
        result[((axis + 1) % 3)] = item_8();
        result[((axis + 2) % 3)] = item_8();
        return result;
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randOnUnitCube_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_8() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randOnUnitCube_7() -> vec3f {
        var face = u32((item_8() * 6));
        var axis = (face % 3);
        var result = vec3f();
        result[axis] = f32(select(0, 1, (face > 2)));
        result[((axis + 1) % 3)] = item_8();
        result[((axis + 2) % 3)] = item_8();
        return result;
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randOnUnitCube_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_9(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_8() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_9(seed_6);
      }

      fn randOnUnitCube_7() -> vec3f {
        var face = u32((item_8() * 6));
        var axis = (face % 3);
        var result = vec3f();
        result[axis] = f32(select(0, 1, (face > 2)));
        result[((axis + 1) % 3)] = item_8();
        result[((axis + 2) % 3)] = item_8();
        return result;
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = randOnUnitCube_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_12() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randNormal_11(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_12());
        var R = sqrt((-2 * log(randUniformExclusive_12())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_9() -> vec3f {
        var u = item_10();
        var v = vec3f(randNormal_11(0, 1), randNormal_11(0, 1), randNormal_11(0, 1));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33));
      }

      fn randInUnitHemisphere_8(normal: vec3f) -> vec3f {
        var value = randInUnitSphere_9();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng_7() -> vec3f {
        return randInUnitHemisphere_8(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_12() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randNormal_11(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_12());
        var R = sqrt((-2 * log(randUniformExclusive_12())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_9() -> vec3f {
        var u = item_10();
        var v = vec3f(randNormal_11(0, 1), randNormal_11(0, 1), randNormal_11(0, 1));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33));
      }

      fn randInUnitHemisphere_8(normal: vec3f) -> vec3f {
        var value = randInUnitSphere_9();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng_7() -> vec3f {
        return randInUnitHemisphere_8(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_11(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_10() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_11(seed_6);
      }

      fn randUniformExclusive_13() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randNormal_12(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_13());
        var R = sqrt((-2 * log(randUniformExclusive_13())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn randInUnitSphere_9() -> vec3f {
        var u = item_10();
        var v = vec3f(randNormal_12(0, 1), randNormal_12(0, 1), randNormal_12(0, 1));
        var vNorm = normalize(v);
        return (vNorm * pow(u, 0.33));
      }

      fn randInUnitHemisphere_8(normal: vec3f) -> vec3f {
        var value = randInUnitSphere_9();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng_7() -> vec3f {
        return randInUnitHemisphere_8(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randOnUnitSphere_9() -> vec3f {
        var z = ((2 * item_10()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_10());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn randOnUnitHemisphere_8(normal: vec3f) -> vec3f {
        var value = randOnUnitSphere_9();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng_7() -> vec3f {
        return randOnUnitHemisphere_8(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randOnUnitSphere_9() -> vec3f {
        var z = ((2 * item_10()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_10());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn randOnUnitHemisphere_8(normal: vec3f) -> vec3f {
        var value = randOnUnitSphere_9();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng_7() -> vec3f {
        return randOnUnitHemisphere_8(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_11(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_10() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_11(seed_6);
      }

      fn randOnUnitSphere_9() -> vec3f {
        var z = ((2 * item_10()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_10());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn randOnUnitHemisphere_8(normal: vec3f) -> vec3f {
        var value = randOnUnitSphere_9();
        var alignment = dot(normal, value);
        return (sign(alignment) * value);
      }

      fn prng_7() -> vec3f {
        return randOnUnitHemisphere_8(vec3f(1.409999966621399, 1.409999966621399, 0));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randBernoulli_8(p: f32) -> f32 {
        var u = item_9();
        return step(u, p);
      }

      fn prng_7() -> vec3f {
        return vec3f(randBernoulli_8(0.7));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randBernoulli_8(p: f32) -> f32 {
        var u = item_9();
        return step(u, p);
      }

      fn prng_7() -> vec3f {
        return vec3f(randBernoulli_8(0.7));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_10(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_9() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_10(seed_6);
      }

      fn randBernoulli_8(p: f32) -> f32 {
        var u = item_9();
        return step(u, p);
      }

      fn prng_7() -> vec3f {
        return vec3f(randBernoulli_8(0.7));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randFloat01_8() -> f32 {
        return item_9();
      }

      fn prng_7() -> vec3f {
        return vec3f(randFloat01_8());
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_9() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randFloat01_8() -> f32 {
        return item_9();
      }

      fn prng_7() -> vec3f {
        return vec3f(randFloat01_8());
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_10(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_9() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_10(seed_6);
      }

      fn randFloat01_8() -> f32 {
        return item_9();
      }

      fn prng_7() -> vec3f {
        return vec3f(randFloat01_8());
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randExponential_8(rate: f32) -> f32 {
        var u = randUniformExclusive_9();
        return ((-1 / rate) * log(u));
      }

      fn prng_7() -> vec3f {
        return vec3f(randExponential_8(1));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randExponential_8(rate: f32) -> f32 {
        var u = randUniformExclusive_9();
        return ((-1 / rate) * log(u));
      }

      fn prng_7() -> vec3f {
        return vec3f(randExponential_8(1));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_11(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_10() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_11(seed_6);
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randExponential_8(rate: f32) -> f32 {
        var u = randUniformExclusive_9();
        return ((-1 / rate) * log(u));
      }

      fn prng_7() -> vec3f {
        return vec3f(randExponential_8(1));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randNormal_8(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_9());
        var R = sqrt((-2 * log(randUniformExclusive_9())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn prng_7() -> vec3f {
        return vec3f(randNormal_8(0, 1));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randNormal_8(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_9());
        var R = sqrt((-2 * log(randUniformExclusive_9())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn prng_7() -> vec3f {
        return vec3f(randNormal_8(0, 1));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_11(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_10() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_11(seed_6);
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randNormal_8(mu: f32, sigma: f32) -> f32 {
        var theta = (6.283185307179586 * randUniformExclusive_9());
        var R = sqrt((-2 * log(randUniformExclusive_9())));
        return (((R * sin(theta)) * sigma) + mu);
      }

      fn prng_7() -> vec3f {
        return vec3f(randNormal_8(0, 1));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randCauchy_8(x0: f32, gamma: f32) -> f32 {
        var u = randUniformExclusive_9();
        return (x0 + (gamma * tan((3.141592653589793 * (u - 0.5)))));
      }

      fn prng_7() -> vec3f {
        return vec3f(randCauchy_8(0, 1));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: vec2f;

      fn seed_5(value: f32) {
        seed_6 = vec2f(value, 0);
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randCauchy_8(x0: f32, gamma: f32) -> f32 {
        var u = randUniformExclusive_9();
        return (x0 + (gamma * tan((3.141592653589793 * (u - 0.5)))));
      }

      fn prng_7() -> vec3f {
        return vec3f(randCauchy_8(0, 1));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }

      struct item_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @group(0) @binding(1) var<storage, read_write> samplesBuffer_2: array<vec3f>;

      @group(0) @binding(0) var<storage, read> seedBuffer_3: array<f32>;

      var<private> seed_6: u32;

      fn seed_5(value: f32) {
        seed_6 = u32((value * 32768));
      }

      fn randSeed_4(seed: f32) {
        seed_5(seed);
      }

      fn u32ToFloat_11(val: u32) -> f32{
          let exponent: u32 = 0x3f800000;
          let mantissa: u32 = 0x007fffff & val;
          var ufloat: u32 = (exponent | mantissa);
          return bitcast<f32>(ufloat) - 1f;
        }

      fn item_10() -> f32 {
        seed_6 = ((seed_6 * 1664525) + 1013904223);
        return u32ToFloat_11(seed_6);
      }

      fn randUniformExclusive_9() -> f32 {
        return ((item_10() * 0.9999998) + 1e-7);
      }

      fn randCauchy_8(x0: f32, gamma: f32) -> f32 {
        var u = randUniformExclusive_9();
        return (x0 + (gamma * tan((3.141592653589793 * (u - 0.5)))));
      }

      fn prng_7() -> vec3f {
        return vec3f(randCauchy_8(0, 1));
      }

      @compute @workgroup_size(64) fn item_0(input: item_1) {
        var id = input.gid.x;
        if ((id >= arrayLength(&samplesBuffer_2))) {
          return;
        }
        randSeed_4(seedBuffer_3[id]);
        samplesBuffer_2[id] = prng_7();
      }"
    `);
  });
});
