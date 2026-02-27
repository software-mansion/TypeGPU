/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('ripple-cube example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'ripple-cube',
      setupMocks: () => mockResizeObserver(),
      expectedCalls: 11,
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

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> memoryBuffer: array<vec3f, 2097152>;

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
        let idx = ((x + (y * 128u)) + ((z * 128u) * 128u));
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

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct FaceBasis {
        forward: vec3f,
        right: vec3f,
        up: vec3f,
      }

      @group(0) @binding(1) var<uniform> faceBasisUniform: FaceBasis;

      @group(0) @binding(2) var<storage, read> memoryBuffer: array<vec3f, 2097152>;

      fn getJunctionGradient(pos: vec3i) -> vec3f {
        var size_i = vec3i(128);
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

      fn quinticInterpolationImpl(t: vec3f) -> vec3f {
        return ((t * (t * t)) * ((t * ((t * 6f) - 15f)) + 10f));
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

      fn spaceNebula(rd: vec3f) -> vec3f {
        let n1 = ((sample((rd * 1.2f)) * 0.5f) + 0.5f);
        let n2 = ((sample(((rd * 2.5f) + 50f)) * 0.5f) + 0.5f);
        let n3 = ((sample(((rd * 5f) + 150f)) * 0.5f) + 0.5f);
        let n4 = ((sample(((rd * 0.8f) + 300f)) * 0.5f) + 0.5f);
        let colorShift = ((sample(((rd * 0.5f) + 500f)) * 0.5f) + 0.5f);
        var purple = (vec3f(0.6000000238418579, 0.10000000149011612, 0.800000011920929) * (pow(n1, 1.8f) * 0.5f));
        var blue = (vec3f(0.10000000149011612, 0.30000001192092896, 0.699999988079071) * (pow(n2, 2f) * 0.4f));
        var cyan = (vec3f(0.10000000149011612, 0.6000000238418579, 0.6000000238418579) * (pow((n3 * n4), 1.5f) * 0.3f));
        var pink = (vec3f(0.699999988079071, 0.20000000298023224, 0.4000000059604645) * ((pow((1f - n1), 3f) * n2) * 0.4f));
        var gold = (vec3f(0.800000011920929, 0.5, 0.10000000149011612) * (pow((n2 * n3), 3f) * 0.6f));
        var color = (((vec3f(0.009999999776482582, 0.009999999776482582, 0.029999999329447746) + mix(purple, blue, colorShift)) + mix(pink, cyan, n4)) + gold);
        color = (color + (mix(vec3f(0.800000011920929, 0.4000000059604645, 1), vec3f(0.4000000059604645, 0.800000011920929, 1), colorShift) * (pow(((n1 * n2) * n3), 4f) * 2f)));
        return color;
      }

      var<private> seed: vec2f;

      fn seed3(value: vec3f) {
        seed = (value.xy + vec2f(value.z));
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
      }

      fn sample_1() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample_1();
      }

      fn spaceBackground(rd: vec3f) -> vec3f {
        var color = spaceNebula(rd);
        var starPos = (rd * 50f);
        randSeed3(floor(starPos));
        var starCenter = ((vec3f(randFloat01(), randFloat01(), randFloat01()) * 0.6f) + 0.2f);
        let starDist = length((fract(starPos) - starCenter));
        let starHash = randFloat01();
        color = (color + (mix(vec3f(1, 0.8999999761581421, 0.800000011920929), vec3f(0.800000011920929, 0.8999999761581421, 1), starHash) * ((pow(max((1f - (starDist * 4f)), 0f), 4f) * step(0.85f, starHash)) * 3f)));
        var bigStarPos = (rd * 20f);
        randSeed3(floor(bigStarPos));
        var bigStarCenter = ((vec3f(randFloat01(), randFloat01(), randFloat01()) * 0.5f) + 0.25f);
        let bigStarDist = length((fract(bigStarPos) - bigStarCenter));
        color = (color + (vec3f(1, 0.949999988079071, 0.8999999761581421) * ((pow(max((1f - (bigStarDist * 3f)), 0f), 3f) * step(0.95f, randFloat01())) * 8f)));
        return color;
      }

      @group(1) @binding(0) var outputTexture: texture_storage_2d<rgba16float, write>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        let u = ((((f32(x) + 0.5f) / 1024f) * 2f) - 1f);
        let v = ((((f32(y) + 0.5f) / 1024f) * 2f) - 1f);
        let basis = (&faceBasisUniform);
        var direction = normalize((((*basis).forward + ((*basis).right * u)) + ((*basis).up * v)));
        var color = spaceBackground(direction);
        textureStore(outputTexture, vec2u(x, y), vec4f(color, 1f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<uniform> timeUniform: f32;

      @group(0) @binding(2) var<uniform> extendedRippleUniform: u32;

      const pointOffsets: array<f32, 11> = array<f32, 11>(0f, 1f, 1f, 2f, 2f, 3f, 3f, 4f, 4f, 5f, 5f);

      fn opSmoothUnion(d1: f32, d2: f32, k: f32) -> f32 {
        let h = (max((k - abs((d1 - d2))), 0f) / k);
        return (min(d1, d2) - (((h * h) * k) * 0.25f));
      }

      @group(0) @binding(3) var<uniform> blendFactorUniform: f32;

      @group(0) @binding(4) var sdfWriteView: texture_storage_3d<rgba16float, write>;

      fn wrappedCallback(x: u32, y: u32, z: u32) {
        const cellSize = 0.0047169811320754715;
        var p = ((vec3f(f32(x), f32(y), f32(z)) + 0.5f) * cellSize);
        let r = (timeUniform * 0.15f);
        let iterCount = select(5, 11, (extendedRippleUniform == 1u));
        var shellD = 1e+10f;
        for (var ix = 0; (ix < iterCount); ix++) {
          for (var iy = 0; (iy < iterCount); iy++) {
            for (var iz = 0; (iz < iterCount); iz++) {
              let ox = pointOffsets[ix];
              let oy = pointOffsets[iy];
              let oz = pointOffsets[iz];
              let qx = select((ox + p.x), (ox - p.x), ((ix % 2i) == 0i));
              let qy = select((oy + p.y), (oy - p.y), ((iy % 2i) == 0i));
              let qz = select((oz + p.z), (oz - p.z), ((iz % 2i) == 0i));
              var q = vec3f(qx, qy, qz);
              shellD = opSmoothUnion(shellD, (abs((length(q) - r)) - 5e-3f), blendFactorUniform);
            }
          }
        }
        textureStore(sdfWriteView, vec3u(x, y, z), vec4f(shellD, 0f, 0f, 1f));
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

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<uniform> timeUniform: f32;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      @group(0) @binding(2) var writeView: texture_storage_2d<rgba16float, write>;

      struct Camera {
        position: vec4f,
        targetPos: vec4f,
        view: mat4x4f,
        projection: mat4x4f,
        viewInverse: mat4x4f,
        projectionInverse: mat4x4f,
      }

      @group(0) @binding(3) var<uniform> cameraUniform: Camera;

      @group(0) @binding(4) var<uniform> jitterUniform: vec2f;

      struct Ray {
        origin: vec4f,
        direction: vec4f,
      }

      fn getRayForUV(uv: vec2f) -> Ray {
        let camera = (&cameraUniform);
        var jitteredUV = (uv + jitterUniform);
        var ndc = (((jitteredUV * 2f) - 1f) * vec2f(1, -1));
        var farView = ((*camera).projectionInverse * vec4f(ndc.xy, 1f, 1f));
        var farWorld = ((*camera).viewInverse * vec4f((farView.xyz / farView.w), 1f));
        var direction = normalize((farWorld.xyz - (*camera).position.xyz));
        return Ray((*camera).position, vec4f(direction, 0f));
      }

      @group(1) @binding(0) var sdfTexture: texture_3d<f32>;

      @group(1) @binding(1) var sdfSampler: sampler;

      fn sdBox3d(point: vec3f, size: vec3f) -> f32 {
        var d = (abs(point) - size);
        return (length(max(d, vec3f())) + min(max(max(d.x, d.y), d.z), 0f));
      }

      fn sdBoxFrame3d(point: vec3f, size: vec3f, thickness: f32) -> f32 {
        var p1 = (abs(point) - size);
        var q = (abs((p1 + thickness)) - vec3f(thickness));
        let d1 = (length(max(vec3f(p1.x, q.y, q.z), vec3f())) + min(max(p1.x, max(q.y, q.z)), 0f));
        let d2 = (length(max(vec3f(q.x, p1.y, q.z), vec3f())) + min(max(q.x, max(p1.y, q.z)), 0f));
        let d3 = (length(max(vec3f(q.x, q.y, p1.z), vec3f())) + min(max(q.x, max(q.y, p1.z)), 0f));
        return min(min(d1, d2), d3);
      }

      fn sceneSDF(p: vec3f) -> f32 {
        var uv = (abs(p) * 2f);
        let sdfValue = textureSampleLevel(sdfTexture, sdfSampler, uv, 0).x;
        let interior = max(sdBox3d(p, vec3f(0.5)), sdfValue);
        return min(sdBoxFrame3d(p, vec3f(0.5), 5e-3f), interior);
      }

      @group(2) @binding(0) var envMap: texture_cube<f32>;

      @group(2) @binding(1) var envSampler: sampler;

      fn getNormal(p: vec3f) -> vec3f {
        const e = 1e-3;
        let dist = sceneSDF(p);
        return normalize(vec3f((sceneSDF((p + vec3f(e, 0f, 0f))) - dist), (sceneSDF((p + vec3f(0f, e, 0f))) - dist), (sceneSDF((p + vec3f(0f, 0f, e))) - dist)));
      }

      struct Material {
        albedo: vec3f,
        metallic: f32,
        roughness: f32,
        ao: f32,
      }

      @group(0) @binding(5) var<uniform> materialUniform: Material;

      struct Light {
        position: vec3f,
        color: vec3f,
      }

      @group(0) @binding(6) var<uniform> lightsUniform: array<Light, 2>;

      fn distributionGGX(ndoth: f32, roughness: f32) -> f32 {
        let a = pow(roughness, 2f);
        let a2 = pow(a, 2f);
        let denom = max(((pow(ndoth, 2f) * (a2 - 1f)) + 1f), 1e-4f);
        return (a2 / (3.141592653589793f * pow(denom, 2f)));
      }

      fn geometrySchlickGGX(ndot: f32, roughness: f32) -> f32 {
        let k = (pow((roughness + 1f), 2f) / 8f);
        return (ndot / ((ndot * (1f - k)) + k));
      }

      fn geometrySmith(ndotv: f32, ndotl: f32, roughness: f32) -> f32 {
        return (geometrySchlickGGX(ndotv, roughness) * geometrySchlickGGX(ndotl, roughness));
      }

      fn fresnelSchlick(cosTheta: f32, f0: vec3f) -> vec3f {
        return (f0 + ((1f - f0) * pow((1f - cosTheta), 5f)));
      }

      fn evaluateLight(p: vec3f, n: vec3f, v: vec3f, light: Light, material: Material, f0: vec3f) -> vec3f {
        var toLight = (light.position - p);
        let dist = length(toLight);
        var l = normalize(toLight);
        var h = normalize((v + l));
        var radiance = (light.color / pow(dist, 2f));
        let ndotl = max(dot(n, l), 0f);
        let ndoth = max(dot(n, h), 0f);
        let ndotv = max(dot(n, v), 1e-3f);
        let ndf = distributionGGX(ndoth, material.roughness);
        let g = geometrySmith(ndotv, ndotl, material.roughness);
        var fresnel = fresnelSchlick(ndoth, f0);
        var specular = ((fresnel * (ndf * g)) / (((4f * ndotv) * ndotl) + 1e-3f));
        var kd = ((1f - fresnel) * (1f - material.metallic));
        return (((((kd * material.albedo) / 3.141592653589793f) + specular) * radiance) * ndotl);
      }

      @group(0) @binding(7) var<storage, read> memoryBuffer: array<vec3f, 32768>;

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

      fn quinticInterpolationImpl(t: vec3f) -> vec3f {
        return ((t * (t * t)) * ((t * ((t * 6f) - 15f)) + 10f));
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

      fn shade(p: vec3f, n: vec3f, v: vec3f) -> vec3f {
        let material = (&materialUniform);
        var f0 = mix(vec3f(0.03999999910593033), (*material).albedo, (*material).metallic);
        var lo = vec3f();
        // unrolled iteration #0
        {
          lo += evaluateLight(p, n, v, lightsUniform[0i], (*material), f0);
        }
        // unrolled iteration #1
        {
          lo += evaluateLight(p, n, v, lightsUniform[1i], (*material), f0);
        }
        var reflectDir = reflect(v, n);
        var pScaled = (p * 50f);
        var roughOffset = ((vec3f(sample(pScaled), sample((pScaled + 100f)), sample((pScaled + 200f))) * (*material).roughness) * 0.3f);
        var blurredReflectDir = normalize((reflectDir + roughOffset));
        var envColor = textureSampleLevel(envMap, envSampler, blurredReflectDir, ((*material).roughness * 4f));
        let ndotv = max(dot(n, v), 0f);
        var fresnel = fresnelSchlick(ndotv, f0);
        var reflectionTint = mix(vec3f(1), (*material).albedo, (*material).metallic);
        let reflectionStrength = (1f - ((*material).roughness * 0.85f));
        var envContribution = (((envColor.rgb * fresnel) * reflectionTint) * reflectionStrength);
        var ambient = ((*material).albedo * ((*material).ao * 0.05f));
        var color = ((ambient + lo) + envContribution);
        return pow((color / (color + 1f)), vec3f(0.4545454680919647));
      }

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        randSeed2((vec2f(f32(x), f32(y)) + timeUniform));
        var textureSize = textureDimensions(writeView);
        var uv = ((vec2f(f32(x), f32(y)) + 0.5f) / vec2f(textureSize));
        var ray = getRayForUV(uv);
        var ro = ray.origin.xyz;
        var rd = ray.direction.xyz;
        var totalDist = 0f;
        var lastDist = 5f;
        var hit = false;
        for (var i = 0; (i < 48i); i++) {
          var p = (ro + (rd * totalDist));
          lastDist = sceneSDF(p);
          if ((lastDist < 1e-3f)) {
            hit = true;
            break;
          }
          if ((totalDist > 5f)) {
            break;
          }
          totalDist += lastDist;
        }
        if (((lastDist < 0.02f) && (totalDist < 5f))) {
          hit = true;
        }
        var finalColor = textureSampleLevel(envMap, envSampler, rd, 0).rgb;
        if (hit) {
          var p = (ro + (rd * totalDist));
          var n = getNormal(p);
          var v = normalize((ro - p));
          var sceneColor = shade(p, n, v);
          let fog = exp((-(totalDist) * 0.05f));
          var fogColor = vec3f(0.019999999552965164, 0.019999999552965164, 0.03999999910593033);
          finalColor = mix(fogColor, sceneColor, fog);
        }
        textureStore(writeView, vec2u(x, y), vec4f(finalColor, 1f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(0) var currentTexture: texture_2d<f32>;

      @group(1) @binding(1) var historyTexture: texture_2d<f32>;

      @group(1) @binding(2) var outputTexture: texture_storage_2d<rgba16float, write>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        var coord = vec2i(i32(x), i32(y));
        var current = textureLoad(currentTexture, coord, 0);
        var historyColor = textureLoad(historyTexture, coord, 0);
        var minColor = vec3f(9999);
        var maxColor = vec3f(-9999);
        // unrolled iteration #0
        {
          // unrolled iteration #0
          {
            var sampleCoord = (coord + vec2i(-1));
            var clampedCoord = clamp(sampleCoord, vec2i(), vec2i(181));
            var neighbor = textureLoad(currentTexture, clampedCoord, 0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
          // unrolled iteration #1
          {
            var sampleCoord = (coord + vec2i(-1, 0));
            var clampedCoord = clamp(sampleCoord, vec2i(), vec2i(181));
            var neighbor = textureLoad(currentTexture, clampedCoord, 0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
          // unrolled iteration #2
          {
            var sampleCoord = (coord + vec2i(-1, 1));
            var clampedCoord = clamp(sampleCoord, vec2i(), vec2i(181));
            var neighbor = textureLoad(currentTexture, clampedCoord, 0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
        }
        // unrolled iteration #1
        {
          // unrolled iteration #0
          {
            var sampleCoord = (coord + vec2i(0, -1));
            var clampedCoord = clamp(sampleCoord, vec2i(), vec2i(181));
            var neighbor = textureLoad(currentTexture, clampedCoord, 0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
          // unrolled iteration #1
          {
            var sampleCoord = (coord + vec2i());
            var clampedCoord = clamp(sampleCoord, vec2i(), vec2i(181));
            var neighbor = textureLoad(currentTexture, clampedCoord, 0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
          // unrolled iteration #2
          {
            var sampleCoord = (coord + vec2i(0, 1));
            var clampedCoord = clamp(sampleCoord, vec2i(), vec2i(181));
            var neighbor = textureLoad(currentTexture, clampedCoord, 0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
        }
        // unrolled iteration #2
        {
          // unrolled iteration #0
          {
            var sampleCoord = (coord + vec2i(1, -1));
            var clampedCoord = clamp(sampleCoord, vec2i(), vec2i(181));
            var neighbor = textureLoad(currentTexture, clampedCoord, 0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
          // unrolled iteration #1
          {
            var sampleCoord = (coord + vec2i(1, 0));
            var clampedCoord = clamp(sampleCoord, vec2i(), vec2i(181));
            var neighbor = textureLoad(currentTexture, clampedCoord, 0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
          // unrolled iteration #2
          {
            var sampleCoord = (coord + vec2i(1));
            var clampedCoord = clamp(sampleCoord, vec2i(), vec2i(181));
            var neighbor = textureLoad(currentTexture, clampedCoord, 0).rgb;
            minColor = min(minColor, neighbor);
            maxColor = max(maxColor, neighbor);
          }
        }
        var clampedHistory = clamp(historyColor.rgb, minColor, maxColor);
        var blended = mix(current.rgb, clampedHistory, 0.85f);
        textureStore(outputTexture, vec2u(x, y), vec4f(blended, 1f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(0) var inputTexture: texture_2d<f32>;

      @group(1) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        var color = textureLoad(inputTexture, vec2i(i32(x), i32(y)), 0);
        textureStore(outputTexture, vec2u(x, y), color);
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;

      @group(1) @binding(0) var inputTexture: texture_2d<f32>;

      @group(1) @binding(2) var sampler_1: sampler;

      struct BloomParams {
        threshold: f32,
        intensity: f32,
      }

      @group(0) @binding(1) var<uniform> bloomUniform: BloomParams;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        var dimensions = textureDimensions(outputTexture);
        var uv = ((vec2f(f32(x), f32(y)) + 0.5f) / vec2f(dimensions));
        var color = textureSampleLevel(inputTexture, sampler_1, uv, 0);
        let brightness = dot(color.rgb, vec3f(0.2125999927520752, 0.7152000069618225, 0.0722000002861023));
        let threshold = bloomUniform.threshold;
        let bright = (max((brightness - threshold), 0f) / max(brightness, 1e-4f));
        var bloomColor = (color.rgb * bright);
        textureStore(outputTexture, vec2u(x, y), vec4f(bloomColor, 1f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(0) var inputTexture: texture_2d<f32>;

      @group(1) @binding(2) var sampler_1: sampler;

      @group(1) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        var dimensions = textureDimensions(inputTexture);
        var texelSize = (1f / vec2f(dimensions));
        var uv = ((vec2f(f32(x), f32(y)) + 0.5f) / vec2f(dimensions));
        var offsetDir = vec2f(1, 0);
        var result = vec3f();
        var totalWeight = 0f;
        for (var i = -8; (i <= 8i); i++) {
          var offset = ((offsetDir * f32(i)) * texelSize);
          let weight = exp((-(f32((i * i))) / 16f));
          result += (textureSampleLevel(inputTexture, sampler_1, (uv + offset), 0).rgb * weight);
          totalWeight += weight;
        }
        textureStore(outputTexture, vec2u(x, y), vec4f((result / totalWeight), 1f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(1) @binding(0) var inputTexture: texture_2d<f32>;

      @group(1) @binding(2) var sampler_1: sampler;

      @group(1) @binding(1) var outputTexture: texture_storage_2d<rgba16float, write>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        var dimensions = textureDimensions(inputTexture);
        var texelSize = (1f / vec2f(dimensions));
        var uv = ((vec2f(f32(x), f32(y)) + 0.5f) / vec2f(dimensions));
        var offsetDir = vec2f(0, 1);
        var result = vec3f();
        var totalWeight = 0f;
        for (var i = -8; (i <= 8i); i++) {
          var offset = ((offsetDir * f32(i)) * texelSize);
          let weight = exp((-(f32((i * i))) / 16f));
          result += (textureSampleLevel(inputTexture, sampler_1, (uv + offset), 0).rgb * weight);
          totalWeight += weight;
        }
        textureStore(outputTexture, vec2u(x, y), vec4f((result / totalWeight), 1f));
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
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

      @group(1) @binding(0) var colorTexture: texture_2d<f32>;

      @group(1) @binding(2) var sampler_1: sampler;

      @group(1) @binding(1) var bloomTexture: texture_2d<f32>;

      struct BloomParams {
        threshold: f32,
        intensity: f32,
      }

      @group(0) @binding(0) var<uniform> bloomUniform: BloomParams;

      struct fragmentMain_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain(_arg_0: fragmentMain_Input) -> @location(0) vec4f {
        var color = textureSample(colorTexture, sampler_1, _arg_0.uv);
        var bloomColor = textureSample(bloomTexture, sampler_1, _arg_0.uv);
        var final_1 = (color.rgb + (bloomColor.rgb * bloomUniform.intensity));
        var centeredUV = ((_arg_0.uv - 0.5f) * 2f);
        let vignette = (1f - (dot(centeredUV, centeredUV) * 0.15f));
        final_1 *= vignette;
        return vec4f(final_1, 1f);
      }"
    `);
  });
});
