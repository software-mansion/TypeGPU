/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('smoky triangle', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'smoky-triangle',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> memoryBuffer: array<vec3f, 32768>;

      var<private> seed: vec2f;

      fn seed3(value: vec3f) {
        seed = (value.xy + vec2f(value.z));
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randOnUnitSphere() -> vec3f {
        let z = ((2f * sample()) - 1f);
        let oneMinusZSq = sqrt((1f - (z * z)));
        let theta = (6.283185307179586f * sample());
        let x = (cos(theta) * oneMinusZSq);
        let y = (sin(theta) * oneMinusZSq);
        return vec3f(x, y, z);
      }

      fn computeJunctionGradient(pos: vec3i) -> vec3f {
        randSeed3((1e-3f * vec3f(pos)));
        return randOnUnitSphere();
      }

      fn wrappedCallback(x: u32, y: u32, z: u32) {
        let idx = ((x + (y * 32u)) + ((z * 32u) * 32u));
        memoryBuffer[idx] = computeJunctionGradient(vec3i(i32(x), i32(y), i32(z)));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      const positions: array<vec2f, 3> = array<vec2f, 3>(vec2f(0, 0.800000011920929), vec2f(-0.800000011920929), vec2f(0.800000011920929, -0.800000011920929));

      const uvs: array<vec2f, 3> = array<vec2f, 3>(vec2f(0.5, 1), vec2f(), vec2f(1, 0));

      struct VertexOut {
        @builtin(position) position: vec4f,
        @location(0) uv: vec2f,
      }

      struct VertexIn {
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn vertex(_arg_0: VertexIn) -> VertexOut {
        return VertexOut(vec4f(positions[_arg_0.vertexIndex], 0f, 1f), uvs[_arg_0.vertexIndex]);
      }

      struct Params {
        fromColor: vec3f,
        toColor: vec3f,
        polarCoords: u32,
        squashed: u32,
        sharpness: f32,
        distortion: f32,
        time: f32,
        grainSeed: f32,
      }

      @group(0) @binding(0) var<uniform> paramsUniform: Params;

      @group(0) @binding(1) var<storage, read> memoryBuffer: array<vec3f, 32768>;

      fn getJunctionGradient(pos: vec3i) -> vec3f {
        var size_i = vec3i(32);
        let x = (((pos.x % size_i.x) + size_i.x) % size_i.x);
        let y = (((pos.y % size_i.y) + size_i.y) % size_i.y);
        let z = (((pos.z % size_i.z) + size_i.z) % size_i.z);
        return memoryBuffer[((x + (y * size_i.x)) + ((z * size_i.x) * size_i.y))];
      }

      fn dotProdGrid(pos: vec3f, junction: vec3f) -> f32 {
        var relative = (pos - junction);
        var gridVector = getJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation(t: vec3f) -> vec3f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
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
        var smoothPartial = quinticInterpolation(partial);
        let xy = mix(xyz, xyZ, smoothPartial.z);
        let xY = mix(xYz, xYZ, smoothPartial.z);
        let Xy = mix(Xyz, XyZ, smoothPartial.z);
        let XY = mix(XYz, XYZ, smoothPartial.z);
        let x = mix(xy, xY, smoothPartial.y);
        let X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn tanhVec(v: vec2f) -> vec2f {
        let len = length(v);
        let tanh_1 = tanh(len);
        return ((v / len) * tanh_1);
      }

      fn getGradientColor(ratio: f32) -> vec3f {
        let p = (&paramsUniform);
        if (((*p).squashed == 1u)) {
          return mix((*p).fromColor, (*p).toColor, smoothstep(0.1f, 0.9f, ratio));
        }
        return mix((*p).fromColor, (*p).toColor, ratio);
      }

      fn grain(color: vec3f, uv: vec2f) -> vec3f {
        return (color + (sample(vec3f((uv * 200f), paramsUniform.grainSeed)) * 0.1f));
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let params = (&paramsUniform);
        let t = ((*params).time * 0.1f);
        var ouv = ((_arg_0.uv * 5f) + vec2f(0f, -(t)));
        var off = (vec2f(sample(vec3f(ouv, t)), (sample(vec3f((ouv * 2f), (t + 10f))) * 0.5f)) + -0.1f);
        off = tanhVec((off * (*params).sharpness));
        var p = (_arg_0.uv + (off * (*params).distortion));
        var factor = 0f;
        if (((*params).polarCoords == 1u)) {
          factor = length(((p - vec2f(0.5, 0.30000001192092896)) * 2f));
        }
        else {
          factor = ((p.x + p.y) * 0.7f);
        }
        return saturate(vec4f(grain(getGradientColor(factor), _arg_0.uv), 1f));
      }"
    `);
  });
});
