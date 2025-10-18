/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('perlin noise example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'perlin-noise',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      @group(1) @binding(0) var<uniform> size_3: vec4u;

      @group(1) @binding(1) var<storage, read_write> memory_4: array<vec3f>;

      var<private> seed_8: vec2f;

      fn seed3_7(value: vec3f) {
        seed_8 = (value.xy + vec2f(value.z));
      }

      fn randSeed3_6(seed: vec3f) {
        seed3_7(seed);
      }

      fn item_10() -> f32 {
        var a = dot(seed_8, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_8, vec2f(54.47856521606445, 345.8415222167969));
        seed_8.x = fract((cos(a) * 136.8168));
        seed_8.y = fract((cos(b) * 534.7645));
        return seed_8.y;
      }

      fn randOnUnitSphere_9() -> vec3f {
        var z = ((2 * item_10()) - 1);
        var oneMinusZSq = sqrt((1 - (z * z)));
        var theta = (6.283185307179586 * item_10());
        var x = (cos(theta) * oneMinusZSq);
        var y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient_5(pos: vec3i) -> vec3f {
        randSeed3_6((1e-3 * vec3f(pos)));
        return randOnUnitSphere_9();
      }

      fn mainCompute_2(x: u32, y: u32, z: u32) {
        var size = size_3;
        var idx = ((x + (y * size.x)) + ((z * size.x) * size.y));
        memory_4[idx] = computeJunctionGradient_5(vec3i(i32(x), i32(y), i32(z)));
      }

      struct mainCompute_Input_11 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute_0(in: mainCompute_Input_11)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        mainCompute_2(in.id.x, in.id.y, in.id.z);
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        mainCompute_1(in.id.x, in.id.y, in.id.z);
      }

      struct fullScreenTriangle_Input {
        @builtin(vertex_index) vertexIndex: u32,
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(in: fullScreenTriangle_Input) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[in.vertexIndex], 0, 1), uv[in.vertexIndex]);
      }

      @group(0) @binding(0) var<uniform> gridSize: f32;

      @group(0) @binding(1) var<uniform> time: f32;

      @group(1) @binding(0) var<uniform> perlin3dCache__size: vec4u;

      @group(1) @binding(1) var<storage, read> perlin3dCache__memory: array<vec3f>;

      fn getJunctionGradient(pos: vec3i) -> vec3f {
        var size = vec3i(perlin3dCache__size.xyz);
        let x = (((pos.x % size.x) + size.x) % size.x);
        let y = (((pos.y % size.y) + size.y) % size.y);
        let z = (((pos.z % size.z) + size.z) % size.z);
        return perlin3dCache__memory[((x + (y * size.x)) + ((z * size.x) * size.y))];
      }

      fn dotProdGrid(pos: vec3f, junction: vec3f) -> f32 {
        var relative = (pos - junction);
        var gridVector = getJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolationImpl(t: vec3f) -> vec3f {
        return ((t * (t * t)) * ((t * ((t * 6) - 15)) + 10));
      }

      fn sample(pos: vec3f) -> f32 {
        var minJunction = floor(pos);
        let xyz = dotProdGrid(pos, minJunction);
        let xyZ = dotProdGrid(pos, (minJunction + vec3f(0, 0, 1)));
        let xYz = dotProdGrid(pos, (minJunction + vec3f(0, 1, 0)));
        let xYZ = dotProdGrid(pos, (minJunction + vec3f(0, 1, 1)));
        let Xyz = dotProdGrid(pos, (minJunction + vec3f(1, 0, 0)));
        let XyZ = dotProdGrid(pos, (minJunction + vec3f(1, 0, 1)));
        let XYz = dotProdGrid(pos, (minJunction + vec3f(1, 1, 0)));
        let XYZ = dotProdGrid(pos, (minJunction + vec3f(1)));
        var partial = (pos - minJunction);
        var smoothPartial = quinticInterpolationImpl(partial);
        let xy = mix(xyz, xyZ, smoothPartial.z);
        let xY = mix(xYz, xYZ, smoothPartial.z);
        let Xy = mix(Xyz, XyZ, smoothPartial.z);
        let XY = mix(XYz, XYZ, smoothPartial.z);
        let x = mix(xy, xY, smoothPartial.y);
        let X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn exponentialSharpen(n: f32, sharpness2: f32) -> f32 {
        return (sign(n) * pow(abs(n), (1f - sharpness2)));
      }

      @group(0) @binding(2) var<uniform> sharpness: f32;

      struct mainFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn mainFragment(input: mainFragment_Input) -> @location(0) vec4f {
        var uv = (gridSize * input.uv);
        let n = sample(vec3f(uv, time));
        let sharp = exponentialSharpen(n, sharpness);
        let n01 = ((sharp * 0.5f) + 0.5f);
        var dark = vec3f(0, 0.20000000298023224, 1);
        var light = vec3f(1, 0.30000001192092896, 0.5);
        return vec4f(mix(dark, light, n01), 1f);
      }"
    `);
  });
});
