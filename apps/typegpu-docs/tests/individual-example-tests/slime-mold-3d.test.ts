/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('slime mold 3d example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simulation',
        name: 'slime-mold-3d',
        expectedCalls: 4,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

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
        let v = vec3f(randNormal(0f, 1f), randNormal(0f, 1f), randNormal(0f, 1f));
        let vNorm = normalize(v);
        return (vNorm * pow(u, 0.33f));
      }

      struct Agent {
        position: vec3f,
        direction: vec3f,
      }

      @group(0) @binding(1) var<storage, read_write> item: array<Agent, 800000>;

      @group(0) @binding(2) var<storage, read_write> item_1: array<Agent, 800000>;

      fn wrappedCallback(x: u32, _arg_1: u32, _arg_2: u32) {
        randSeed((f32(x) / 8e+5f));
        let pos = ((randInUnitSphere() * 64f) + vec3f(128));
        let center = vec3f(128);
        let dir = normalize((center - pos));
        item[x] = Agent(pos, dir);
        item_1[x] = Agent(pos, dir);
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        wrappedCallback(id.x, id.y, id.z);
      }

      @group(1) @binding(0) var oldState: texture_3d<f32>;

      @group(1) @binding(2) var sampler_1: sampler;

      fn getSummand(uv: vec3f, offset: vec3f) -> f32 {
        return textureSampleLevel(oldState, sampler_1, (uv + offset), 0).x;
      }

      struct Params {
        deltaTime: f32,
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      @group(1) @binding(1) var newState: texture_storage_3d<r32float, write>;

      @compute @workgroup_size(4, 4, 4) fn blur(@builtin(global_invocation_id) gid: vec3u) {
        let dims = textureDimensions(oldState);
        if ((((gid.x >= dims.x) || (gid.y >= dims.y)) || (gid.z >= dims.z))) {
          return;
        }
        let uv = ((vec3f(gid) + 0.5f) / vec3f(dims));
        var sum = 0f;
        sum += getSummand(uv, (vec3f(-1, 0, 0) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(1, 0, 0) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(0, -1, 0) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(0, 1, 0) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(0, 0, -1) / vec3f(dims)));
        sum += getSummand(uv, (vec3f(0, 0, 1) / vec3f(dims)));
        let blurred = (sum / 6f);
        let newValue = saturate((blurred - params.evaporationRate));
        textureStore(newState, gid.xyz, vec4f(newValue, 0f, 0f, 1f));
      }

      var<private> seed: vec2f;

      fn seed_1(value: f32) {
        seed = vec2f(value, 0f);
      }

      fn randSeed(seed: f32) {
        seed_1(seed);
      }

      @group(1) @binding(1) var oldState: texture_storage_3d<r32float, read>;

      struct Agent {
        position: vec3f,
        direction: vec3f,
      }

      @group(1) @binding(0) var<storage, read> oldAgents: array<Agent>;

      fn getPerpendicular(dir: vec3f) -> vec3f {
        var axis = vec3f(1, 0, 0);
        let absX = abs(dir.x);
        let absY = abs(dir.y);
        let absZ = abs(dir.z);
        if (((absY <= absX) && (absY <= absZ))) {
          axis = vec3f(0, 1, 0);
        }
        else {
          if (((absZ <= absX) && (absZ <= absY))) {
            axis = vec3f(0, 0, 1);
          }
        }
        return normalize(cross(dir, axis));
      }

      struct Params {
        deltaTime: f32,
        moveSpeed: f32,
        sensorAngle: f32,
        sensorDistance: f32,
        turnSpeed: f32,
        evaporationRate: f32,
      }

      @group(0) @binding(0) var<uniform> params: Params;

      struct SenseResult {
        weightedDir: vec3f,
        totalWeight: f32,
      }

      fn sense3D(pos: vec3f, direction: vec3f) -> SenseResult {
        let dims = textureDimensions(oldState);
        let dimsf = vec3f(dims);
        var weightedDir = vec3f();
        var totalWeight = 0f;
        let perp1 = getPerpendicular(direction);
        let perp2 = cross(direction, perp1);
        // unrolled iteration #0
        {
          const theta = 0.;
          let coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          let sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          let sensorPos = (pos + (sensorDir * params.sensorDistance));
          let sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - 1f)));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #1
        {
          const theta = 0.7853981633974483;
          let coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          let sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          let sensorPos = (pos + (sensorDir * params.sensorDistance));
          let sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - 1f)));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #2
        {
          const theta = 1.5707963267948966;
          let coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          let sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          let sensorPos = (pos + (sensorDir * params.sensorDistance));
          let sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - 1f)));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #3
        {
          const theta = 2.356194490192345;
          let coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          let sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          let sensorPos = (pos + (sensorDir * params.sensorDistance));
          let sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - 1f)));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #4
        {
          const theta = 3.141592653589793;
          let coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          let sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          let sensorPos = (pos + (sensorDir * params.sensorDistance));
          let sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - 1f)));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #5
        {
          const theta = 3.9269908169872414;
          let coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          let sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          let sensorPos = (pos + (sensorDir * params.sensorDistance));
          let sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - 1f)));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #6
        {
          const theta = 4.71238898038469;
          let coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          let sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          let sensorPos = (pos + (sensorDir * params.sensorDistance));
          let sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - 1f)));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        // unrolled iteration #7
        {
          const theta = 5.497787143782138;
          let coneOffset = ((perp1 * cos(theta)) + (perp2 * sin(theta)));
          let sensorDir = normalize((direction + (coneOffset * sin(params.sensorAngle))));
          let sensorPos = (pos + (sensorDir * params.sensorDistance));
          let sensorPosInt = vec3u(clamp(sensorPos, vec3f(), (dimsf - 1f)));
          let weight = textureLoad(oldState, sensorPosInt).x;
          weightedDir = (weightedDir + (sensorDir * weight));
          totalWeight = (totalWeight + weight);
        }
        return SenseResult(weightedDir, totalWeight);
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

      fn randOnUnitHemisphere(normal: vec3f) -> vec3f {
        let value = randOnUnitSphere();
        let alignment = dot(normal, value);
        return (sign(alignment) * value);
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

      @group(1) @binding(2) var<storage, read_write> newAgents: array<Agent>;

      @group(1) @binding(3) var newState_1: texture_storage_3d<r32float, write>;

      @compute @workgroup_size(64) fn updateAgents(@builtin(global_invocation_id) gid: vec3u) {
        if ((gid.x >= 800000u)) {
          return;
        }
        randSeed(((f32(gid.x) / 8e+5f) + 0.1f));
        let dims = textureDimensions(oldState);
        let dimsf = vec3f(dims);
        let agent = (&oldAgents[gid.x]);
        var direction = normalize((*agent).direction);
        let senseResult = sense3D((*agent).position, direction);
        let targetDirection = select(randOnUnitHemisphere(direction), normalize(senseResult.weightedDir), (senseResult.totalWeight > 0.01f));
        direction = normalize((direction + ((targetDirection * params.turnSpeed) * params.deltaTime)));
        var newPos = ((*agent).position + ((direction * params.moveSpeed) * params.deltaTime));
        let center = (dimsf / 2f);
        if (((newPos.x < 0f) || (newPos.x >= dimsf.x))) {
          newPos.x = clamp(newPos.x, 0f, (dimsf.x - 1f));
          var normal = vec3f(1, 0, 0);
          if ((newPos.x > 1f)) {
            normal = vec3f(-1, 0, 0);
          }
          let randomDir = randInUnitHemisphere(normal);
          let toCenter = normalize((center - newPos));
          direction = normalize(((randomDir * 0.3f) + (toCenter * 0.7f)));
        }
        if (((newPos.y < 0f) || (newPos.y >= dimsf.y))) {
          newPos.y = clamp(newPos.y, 0f, (dimsf.y - 1f));
          var normal = vec3f(0, 1, 0);
          if ((newPos.y > 1f)) {
            normal = vec3f(0, -1, 0);
          }
          let randomDir = randInUnitHemisphere(normal);
          let toCenter = normalize((center - newPos));
          direction = normalize(((randomDir * 0.3f) + (toCenter * 0.7f)));
        }
        if (((newPos.z < 0f) || (newPos.z >= dimsf.z))) {
          newPos.z = clamp(newPos.z, 0f, (dimsf.z - 1f));
          var normal = vec3f(0, 0, 1);
          if ((newPos.z > 1f)) {
            normal = vec3f(0, 0, -1);
          }
          let randomDir = randInUnitHemisphere(normal);
          let toCenter = normalize((center - newPos));
          direction = normalize(((randomDir * 0.3f) + (toCenter * 0.7f)));
        }
        newAgents[gid.x] = Agent(newPos, direction);
        let oldState_1 = textureLoad(oldState, vec3u(newPos)).x;
        let newState = (oldState_1 + 1f);
        textureStore(newState_1, vec3u(newPos), vec4f(newState, 0f, 0f, 1f));
      }

      struct fullScreenTriangle_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn fullScreenTriangle(@builtin(vertex_index) vertexIndex: u32) -> fullScreenTriangle_Output {
        const pos = array<vec2f, 3>(vec2f(-1, -1), vec2f(3, -1), vec2f(-1, 3));
        const uv = array<vec2f, 3>(vec2f(0, 1), vec2f(2, 1), vec2f(0, -1));

        return fullScreenTriangle_Output(vec4f(pos[vertexIndex], 0, 1), uv[vertexIndex]);
      }

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      struct Camera {
        viewProj: mat4x4f,
        invViewProj: mat4x4f,
        position: vec3f,
      }

      @group(0) @binding(0) var<uniform> cameraData: Camera;

      struct RayBoxResult {
        tNear: f32,
        tFar: f32,
        hit: bool,
      }

      fn rayBoxIntersection(rayOrigin: vec3f, rayDir: vec3f, boxMin: vec3f, boxMax: vec3f) -> RayBoxResult {
        let invDir = (1f / rayDir);
        let t0 = ((boxMin - rayOrigin) * invDir);
        let t1 = ((boxMax - rayOrigin) * invDir);
        let tmin = min(t0, t1);
        let tmax = max(t0, t1);
        let tNear = max(max(tmin.x, tmin.y), tmin.z);
        let tFar = min(min(tmax.x, tmax.y), tmax.z);
        let hit = ((tFar >= tNear) && (tFar >= 0f));
        return RayBoxResult(tNear, tFar, hit);
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      @group(1) @binding(0) var state: texture_3d<f32>;

      @group(0) @binding(1) var sampler_1: sampler;

      struct fragmentShader_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentShader(_arg_0: fragmentShader_Input) -> @location(0) vec4f {
        randSeed2(_arg_0.uv);
        let ndc = vec2f(((_arg_0.uv.x * 2f) - 1f), (1f - (_arg_0.uv.y * 2f)));
        let ndcNear = vec4f(ndc, -1f, 1f);
        let ndcFar = vec4f(ndc, 1f, 1f);
        let worldNear = (cameraData.invViewProj * ndcNear);
        let worldFar = (cameraData.invViewProj * ndcFar);
        let rayOrigin = (worldNear.xyz / worldNear.w);
        let rayEnd = (worldFar.xyz / worldFar.w);
        let rayDir = normalize((rayEnd - rayOrigin));
        let boxMin = vec3f();
        let boxMax = vec3f(256);
        let isect = rayBoxIntersection(rayOrigin, rayDir, boxMin, boxMax);
        if (!isect.hit) {
          return vec4f();
        }
        let jitter = (randFloat01() * 20f);
        let tStart = max((isect.tNear + jitter), jitter);
        let tEnd = isect.tFar;
        let intersectionLength = (tEnd - tStart);
        const baseStepsPerUnit = 0.30000001192092896f;
        const minSteps = 8i;
        const maxSteps = 48i;
        let adaptiveSteps = clamp(i32((intersectionLength * baseStepsPerUnit)), minSteps, maxSteps);
        let numSteps = adaptiveSteps;
        let stepSize = (intersectionLength / f32(numSteps));
        const thresholdLo = 0.05999999865889549f;
        const thresholdHi = 0.25f;
        const gamma = 1.399999976158142f;
        const sigmaT = 0.10000000149011612f;
        let albedo = vec3f(0.5699999928474426, 0.4399999976158142, 0.9599999785423279);
        var transmittance = 1f;
        var accum = vec3f();
        const TMin = 0.0010000000474974513f;
        var i = 0i;
        while (((i < numSteps) && (transmittance > TMin))) {
          let t = (tStart + ((f32(i) + 0.5f) * stepSize));
          let pos = (rayOrigin + (rayDir * t));
          let texCoord = (pos / vec3f(256));
          let sampleValue = textureSampleLevel(state, sampler_1, texCoord, 0).x;
          let d0 = smoothstep(thresholdLo, thresholdHi, sampleValue);
          let density = pow(d0, gamma);
          let alphaSrc = (1f - exp(((-(sigmaT) * density) * stepSize)));
          let contrib = (albedo * alphaSrc);
          accum += (contrib * transmittance);
          transmittance = (transmittance * (1f - alphaSrc));
          i += 1i;
        }
        let alpha = (1f - transmittance);
        return vec4f(accum, alpha);
      }"
    `);
  });
});
