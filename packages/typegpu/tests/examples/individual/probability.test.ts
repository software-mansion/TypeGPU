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
      expectedCalls: 3,
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

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
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

      var<private> seed: u32;

      fn seed_1(value: f32) {
        seed = u32((value * 32768f));
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      fn u32To01Float(value: u32) -> f32 {
        let mantissa = (value >> 9u);
        let bits = (1065353216u | mantissa);
        let f = bitcast<f32>(bits);
        return (f - 1f);
      }

      fn sample() -> f32 {
        seed = ((seed * 1664525u) + 1013904223u);
        return u32To01Float(seed);
      }

      fn randBernoulli(p: f32) -> f32 {
        let u = sample();
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

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
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
