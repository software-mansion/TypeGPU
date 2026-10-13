/**
 * @vitest-environment jsdom
 */

import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { createDeepNoopProxy } from './utils/testUtils.ts';

describe('fire-text example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simulation',
        name: 'fire-text',
        setupMocks: () => {
          vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
            function (this: HTMLCanvasElement) {
              return createDeepNoopProxy({
                canvas: this,
                measureText: (text: string) => ({ width: text.length * 10 }),
                getImageData: (_x: number, _y: number, width: number, height: number) => ({
                  data: new Uint8ClampedArray(width * height * 4),
                }),
              }) as unknown as ReturnType<HTMLCanvasElement['getContext']>;
            },
          );
        },
        expectedCalls: 9,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      @group(0) @binding(1) var<storage, read_write> memoryBuffer: array<vec3f, 32768>;

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

      fn scrambleSeed3(value: vec3f) -> vec3u {
        let u32Value = bitcast<vec3u>(value);
        return vec3u(hash((u32Value.x ^ 1253408251u)), hash((u32Value.y ^ 2900286023u)), hash((u32Value.z ^ 3164612939u)));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed3(value: vec3f) {
        let scrambled = scrambleSeed3(value);
        let newSeed = vec2u(hash((scrambled.x ^ rotl(scrambled.z, 16u))), hash((rotl(scrambled.y, 16u) ^ scrambled.z)));
        gpuSeed = newSeed;
      }

      fn randSeed3(seed: vec3f) {
        seed3(seed);
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

      fn computeJunctionGradient(pos: vec3i) -> vec3f {
        randSeed3((1e-3f * vec3f(pos)));
        return randOnUnitSphere();
      }

      fn wrappedCallback(x: u32, y: u32, z: u32) {
        let idx = ((x + (y * 32u)) + ((z * 32u) * 32u));
        memoryBuffer[idx] = computeJunctionGradient(vec3i(i32(x), i32(y), i32(z)));
      }

      @compute @workgroup_size(8, 8, 4) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        wrappedCallback(id.x, id.y, id.z);
      }

      struct SimParams {
        time: f32,
        dt: f32,
        densityDecay: f32,
        tempDecay: f32,
        buoyancy: f32,
        vorticityStrength: f32,
        thermalStrength: f32,
        textInsidePressure: f32,
        caretRect: vec4f,
        caretBlinkStart: f32,
        cursorBlink: u32,
      }

      @group(0) @binding(0) var<uniform> simUniform: SimParams;

      struct BrushParams {
        oldStampPos: vec2f,
        newStampPos: vec2f,
        radius: f32,
        isSoft: u32,
        isBrushing: u32,
        mouseVelocity: vec2f,
      }

      @group(0) @binding(1) var<uniform> brushUniform: BrushParams;

      @group(1) @binding(1) var inTex: texture_2d<f32>;

      @group(1) @binding(0) var linearSampler: sampler;

      @group(2) @binding(0) var tex: texture_2d<f32>;

      @group(1) @binding(3) var textTex: texture_2d<f32>;

      fn sdLine(point: vec2f, A: vec2f, B: vec2f) -> f32 {
        let pa = (point - A);
        let ba = (B - A);
        let h = max(0f, min(1f, (dot(pa, ba) / dot(ba, ba))));
        return distance(pa, (ba * h));
      }

      fn brushDistance(pos: vec2f, start: vec2f, end: vec2f) -> f32 {
        if (all(start == end)) {
          return distance(pos, start);
        }
        return sdLine(pos, start, end);
      }

      fn brushWeight(pos: vec2f) -> f32 {
        let b = (&brushUniform);
        let dist = brushDistance(pos, (*b).oldStampPos, (*b).newStampPos);
        if ((dist > (*b).radius)) {
          return 0f;
        }
        if (((*b).isSoft == 1u)) {
          return (1f - smoothstep(((*b).radius * 0.05f), (*b).radius, dist));
        }
        return 1f;
      }

      @group(1) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn advection(@builtin(global_invocation_id) gid: vec3u) {
        let s = (&simUniform);
        let b = (&brushUniform);
        let pos = gid.xy;
        let size = vec2f(textureDimensions(inTex));
        let uv = ((vec2f(pos) + 0.5f) / size);
        let flow = textureLoad(inTex, pos, 0).xy;
        let state = textureSampleLevel(inTex, linearSampler, (uv - ((flow * (*s).dt) / size)), 0);
        let emitted = textureLoad(tex, pos, 0).x;
        let mask = textureLoad(textTex, pos, 0).xy;
        var printed = mask.x;
        if ((((*s).cursorBlink == 1u) && ((((*s).time - (*s).caretBlinkStart) % 1.6f) < 0.8f))) {
          let texel = vec2f(pos);
          let coverage = max((min((texel + 1f), (*s).caretRect.zw) - max(texel, (*s).caretRect.xy)), vec2f());
          printed = max(printed, ((coverage.x * coverage.y) * (1f - mask.y)));
        }
        var velocity = state.xy;
        var density = max(state.z, max(emitted, printed));
        var heat = max(state.w, max(emitted, printed));
        if (((*b).isBrushing == 1u)) {
          let weight = brushWeight((vec2f(pos) + 0.5f));
          velocity += (((*b).mouseVelocity * weight) * 0.15f);
          density = max(density, weight);
          heat = max(heat, weight);
        }
        textureStore(outTex, pos, vec4f(velocity, (density * (*s).densityDecay), (heat * (*s).tempDecay)));
      }

      struct SimParams {
        time: f32,
        dt: f32,
        densityDecay: f32,
        tempDecay: f32,
        buoyancy: f32,
        vorticityStrength: f32,
        thermalStrength: f32,
        textInsidePressure: f32,
        caretRect: vec4f,
        caretBlinkStart: f32,
        cursorBlink: u32,
      }

      @group(0) @binding(0) var<uniform> simUniform: SimParams;

      @group(1) @binding(1) var inTex: texture_2d<f32>;

      @group(1) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;

      fn velocityAt(coord: vec2i, size: vec2i) -> vec2f {
        return textureLoad(inTex, clamp(coord, vec2i(), (size - 1i)), 0).xy;
      }

      fn curlAt(coord: vec2i, size: vec2i) -> f32 {
        let dvy = (velocityAt((coord + vec2i(1, 0)), size).y - velocityAt((coord + vec2i(-1, 0)), size).y);
        let dvx = (velocityAt((coord + vec2i(0, 1)), size).x - velocityAt((coord + vec2i(0, -1)), size).x);
        return (0.5f * (dvy - dvx));
      }

      fn heatAt(coord: vec2i) -> f32 {
        return textureLoad(inTex, coord, 0).w;
      }

      @group(0) @binding(1) var<storage, read> memoryBuffer: array<vec3f, 32768>;

      fn getJunctionGradient(pos: vec3i) -> vec3f {
        let size_i = vec3i(32);
        let x = (((pos.x % size_i.x) + size_i.x) % size_i.x);
        let y = (((pos.y % size_i.y) + size_i.y) % size_i.y);
        let z = (((pos.z % size_i.z) + size_i.z) % size_i.z);
        return memoryBuffer[((x + (y * size_i.x)) + ((z * size_i.x) * size_i.y))];
      }

      fn dotProdGrid(pos: vec3f, junction: vec3f) -> f32 {
        let relative = (pos - junction);
        let gridVector = getJunctionGradient(vec3i(junction));
        return dot(relative, gridVector);
      }

      fn quinticInterpolation(t: vec3f) -> vec3f {
        return (((t * t) * t) * ((t * ((t * 6f) - 15f)) + 10f));
      }

      fn sample(pos: vec3f) -> f32 {
        let minJunction = floor(pos);
        let xyz = dotProdGrid(pos, minJunction);
        let xyZ = dotProdGrid(pos, (minJunction + vec3f(0, 0, 1)));
        let xYz = dotProdGrid(pos, (minJunction + vec3f(0, 1, 0)));
        let xYZ = dotProdGrid(pos, (minJunction + vec3f(0, 1, 1)));
        let Xyz = dotProdGrid(pos, (minJunction + vec3f(1, 0, 0)));
        let XyZ = dotProdGrid(pos, (minJunction + vec3f(1, 0, 1)));
        let XYz = dotProdGrid(pos, (minJunction + vec3f(1, 1, 0)));
        let XYZ = dotProdGrid(pos, (minJunction + vec3f(1)));
        let partial = (pos - minJunction);
        let smoothPartial = quinticInterpolation(partial);
        let xy = mix(xyz, xyZ, smoothPartial.z);
        let xY = mix(xYz, xYZ, smoothPartial.z);
        let Xy = mix(Xyz, XyZ, smoothPartial.z);
        let XY = mix(XYz, XYZ, smoothPartial.z);
        let x = mix(xy, xY, smoothPartial.y);
        let X = mix(Xy, XY, smoothPartial.y);
        return mix(x, X, smoothPartial.x);
      }

      fn swirl(dir: vec2f, curl: f32) -> vec2f {
        let len = length(dir);
        if ((len <= 1e-4f)) {
          return vec2f();
        }
        let n = (dir / len);
        return vec2f((n.y * curl), (-(n.x) * curl));
      }

      @compute @workgroup_size(16, 16) fn vorticity(@builtin(global_invocation_id) gid: vec3u) {
        let s = (&simUniform);
        let pos = gid.xy;
        let coord = vec2i(pos);
        let size = vec2i(textureDimensions(inTex));
        let state = textureLoad(inTex, pos, 0);
        if (((((coord.x <= 2i) || (coord.y <= 2i)) || (coord.x >= (size.x - 3i))) || (coord.y >= (size.y - 3i)))) {
          textureStore(outTex, pos, state);
          return;
        }
        let curl = curlAt(coord, size);
        let eta = (vec2f((abs(curlAt((coord + vec2i(1, 0)), size)) - abs(curlAt((coord + vec2i(-1, 0)), size))), (abs(curlAt((coord + vec2i(0, 1)), size)) - abs(curlAt((coord + vec2i(0, -1)), size)))) * 0.5f);
        let heatGradient = (vec2f((heatAt((coord + vec2i(1, 0))) - heatAt((coord + vec2i(-1, 0)))), (heatAt((coord + vec2i(0, 1))) - heatAt((coord + vec2i(0, -1))))) * 0.5f);
        let noise = sample(vec3f(((vec2f(coord) + 0.5f) * 0.02f), (*s).time));
        let force = ((((swirl(eta, curl) * (*s).vorticityStrength) * state.w) + (swirl(heatGradient, curl) * (*s).thermalStrength)) + vec2f(((noise * 40f) * state.w), (-((*s).buoyancy) * state.w)));
        var velocity = (state.xy + (force * (*s).dt));
        let speed = length(velocity);
        if ((speed > 1000f)) {
          velocity = ((velocity / speed) * 1000f);
        }
        textureStore(outTex, pos, vec4f(velocity, state.zw));
      }

      @group(1) @binding(1) var inTex: texture_2d<f32>;

      const CROSS: array<vec2i, 4> = array<vec2i, 4>(vec2i(-1, 0), vec2i(1, 0), vec2i(0, -1), vec2i(0, 1));

      fn velocityAt(coord: vec2i, size: vec2i) -> vec2f {
        return textureLoad(inTex, clamp(coord, vec2i(), (size - 1i)), 0).xy;
      }

      @group(2) @binding(1) var textTex: texture_2d<f32>;

      struct SimParams {
        time: f32,
        dt: f32,
        densityDecay: f32,
        tempDecay: f32,
        buoyancy: f32,
        vorticityStrength: f32,
        thermalStrength: f32,
        textInsidePressure: f32,
        caretRect: vec4f,
        caretBlinkStart: f32,
        cursorBlink: u32,
      }

      @group(0) @binding(0) var<uniform> simUniform: SimParams;

      @group(2) @binding(0) var divTex: texture_storage_2d<r32float, write>;

      @group(2) @binding(2) var pressureTex: texture_storage_2d<r32float, write>;

      @compute @workgroup_size(16, 16) fn divergence(@builtin(global_invocation_id) gid: vec3u) {
        let pos = gid.xy;
        let coord = vec2i(pos);
        let size = vec2i(textureDimensions(inTex));
        var div = 0f;
        // unrolled iteration #0
        div += dot(vec2f(CROSS[0u]), velocityAt((coord + CROSS[0u]), size));
        // unrolled iteration #1
        div += dot(vec2f(CROSS[1u]), velocityAt((coord + CROSS[1u]), size));
        // unrolled iteration #2
        div += dot(vec2f(CROSS[2u]), velocityAt((coord + CROSS[2u]), size));
        // unrolled iteration #3
        div += dot(vec2f(CROSS[3u]), velocityAt((coord + CROSS[3u]), size));
        // ---
        let fill = textureLoad(textTex, pos, 0).y;
        textureStore(divTex, pos, vec4f(((div * 0.5f) - (fill * simUniform.textInsidePressure))));
        textureStore(pressureTex, pos, vec4f());
      }

      @group(0) @binding(0) var inTex: texture_storage_2d<r32float, read>;

      const CROSS: array<vec2i, 4> = array<vec2i, 4>(vec2i(-1, 0), vec2i(1, 0), vec2i(0, -1), vec2i(0, 1));

      fn pressureAt(coord: vec2i, size: vec2i) -> f32 {
        return textureLoad(inTex, clamp(coord, vec2i(), (size - 1i))).x;
      }

      @group(0) @binding(2) var divTex: texture_2d<f32>;

      @group(0) @binding(1) var outTex: texture_storage_2d<r32float, write>;

      @compute @workgroup_size(16, 16) fn pressureJacobi(@builtin(global_invocation_id) gid: vec3u) {
        let pos = gid.xy;
        let coord = vec2i(pos);
        let size = vec2i(textureDimensions(inTex));
        var sum = 0f;
        // unrolled iteration #0
        sum += pressureAt((coord + CROSS[0u]), size);
        // unrolled iteration #1
        sum += pressureAt((coord + CROSS[1u]), size);
        // unrolled iteration #2
        sum += pressureAt((coord + CROSS[2u]), size);
        // unrolled iteration #3
        sum += pressureAt((coord + CROSS[3u]), size);
        // ---
        let div = textureLoad(divTex, pos, 0).x;
        textureStore(outTex, pos, vec4f(((sum - div) * 0.25f)));
      }

      @group(0) @binding(0) var inTex: texture_storage_2d<r32float, read>;

      const CROSS: array<vec2i, 4> = array<vec2i, 4>(vec2i(-1, 0), vec2i(1, 0), vec2i(0, -1), vec2i(0, 1));

      fn pressureAt(coord: vec2i, size: vec2i) -> f32 {
        return textureLoad(inTex, clamp(coord, vec2i(), (size - 1i))).x;
      }

      @group(1) @binding(1) var inTex_1: texture_2d<f32>;

      @group(1) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;

      @compute @workgroup_size(16, 16) fn gradientSubtraction(@builtin(global_invocation_id) gid: vec3u) {
        let pos = gid.xy;
        let coord = vec2i(pos);
        let size = vec2i(textureDimensions(inTex));
        var gradient = vec2f();
        // unrolled iteration #0
        gradient += (vec2f(CROSS[0u]) * pressureAt((coord + CROSS[0u]), size));
        // unrolled iteration #1
        gradient += (vec2f(CROSS[1u]) * pressureAt((coord + CROSS[1u]), size));
        // unrolled iteration #2
        gradient += (vec2f(CROSS[2u]) * pressureAt((coord + CROSS[2u]), size));
        // unrolled iteration #3
        gradient += (vec2f(CROSS[3u]) * pressureAt((coord + CROSS[3u]), size));
        // ---
        let state = textureLoad(inTex_1, pos, 0);
        var velocity = (state.xy - (gradient * 0.5f));
        if (((coord.x == 0i) || (coord.x == (size.x - 1i)))) {
          velocity.x = 0f;
        }
        if (((coord.y == 0i) || (coord.y == (size.y - 1i)))) {
          velocity.y = 0f;
        }
        textureStore(outTex, pos, vec4f(velocity, state.zw));
      }

      struct Particle {
        pos: vec2f,
        vel: vec2f,
        life: f32,
        maxLife: f32,
      }

      @group(1) @binding(0) var<storage, read_write> particles: array<Particle>;

      struct SimParams {
        time: f32,
        dt: f32,
        densityDecay: f32,
        tempDecay: f32,
        buoyancy: f32,
        vorticityStrength: f32,
        thermalStrength: f32,
        textInsidePressure: f32,
        caretRect: vec4f,
        caretBlinkStart: f32,
        cursorBlink: u32,
      }

      @group(0) @binding(0) var<uniform> simUniform: SimParams;

      @group(2) @binding(1) var inTex: texture_2d<f32>;

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

      fn scrambleSeed2(value: vec2f) -> vec2u {
        let u32Value = bitcast<vec2u>(value);
        return vec2u(hash((u32Value.x ^ 1253408251u)), hash((u32Value.y ^ 2900286023u)));
      }

      fn rotl(x: u32, k: u32) -> u32 {
        return ((x << k) | (x >> (32u - k)));
      }

      var<private> gpuSeed: vec2u;

      fn seed2(value: vec2f) {
        let scrambled = scrambleSeed2(value);
        let newSeed = vec2u(hash((scrambled.x ^ scrambled.y)), hash((rotl(scrambled.x, 16u) ^ scrambled.y)));
        gpuSeed = newSeed;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
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

      @group(2) @binding(3) var textTex: texture_2d<f32>;

      @group(2) @binding(0) var linearSampler: sampler;

      @compute @workgroup_size(256) fn updateParticles(@builtin(global_invocation_id) gid: vec3u) {
        let idx = gid.x;
        if ((idx >= arrayLength(&particles))) {
          return;
        }
        let dt = simUniform.dt;
        let time = simUniform.time;
        let size = f32(textureDimensions(inTex).x);
        var p = particles[idx];
        p.life -= dt;
        if ((p.life <= 0f)) {
          randSeed2(vec2f(f32(idx), time));
          let randU = randFloat01();
          let randV = randFloat01();
          let testUv = vec2f(randU, randV);
          let texel = vec2i((testUv * size));
          let fluidState = textureLoad(inTex, texel, 0);
          let temperature = fluidState.w;
          let spawnChance = randFloat01();
          let maskVal = textureLoad(textTex, texel, 0).x;
          if ((((temperature > 0.8f) && (spawnChance < 0.4f)) && (maskVal < 0.05f))) {
            p.pos = (testUv * size);
            p.vel = vec2f((((randU * 2f) - 1f) * 160f), (-50f - (randFloat01() * 50f)));
            p.maxLife = (0.3f + randFloat01());
            p.life = p.maxLife;
          }
        }
        else {
          let uv = (p.pos / size);
          let fluidState = textureSampleLevel(inTex, linearSampler, uv, 0);
          p.vel = mix(p.vel, fluidState.xy, 0.3f);
          p.pos += (p.vel * dt);
        }
        particles[idx] = p;
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

      @group(1) @binding(1) var displayTex: texture_2d<f32>;

      @group(1) @binding(0) var linearSampler: sampler;

      fn sampleDisplay(uv: vec2f) -> vec4f {
        return textureSampleLevel(displayTex, linearSampler, uv, 0);
      }

      struct ShadingParams {
        fireTint: vec2f,
        tempPower: f32,
        particleSize: f32,
      }

      @group(0) @binding(0) var<uniform> shadingUniform: ShadingParams;

      fn rgbToHsv(rgb: vec3f) -> vec3f {
        let r = rgb.x;
        let g = rgb.y;
        let b = rgb.z;
        let maxC = max(r, max(g, b));
        let minC = min(r, min(g, b));
        let delta = (maxC - minC);
        var h = 0f;
        var s = 0f;
        if ((maxC == 0f)) {
          s = 0f;
        }
        else {
          s = (delta / maxC);
        }
        let v = maxC;
        if ((maxC == minC)) {
          h = 0f;
        }
        else {
          if ((maxC == r)) {
            var cond = 0f;
            if ((g < b)) {
              cond = 6f;
            }
            else {
              cond = 0f;
            }
            h = ((g - b) + (delta * cond));
            h /= (6f * delta);
          }
          else {
            if ((maxC == g)) {
              h = ((b - r) + (delta * 2f));
              h /= (6f * delta);
            }
            else {
              if ((maxC == b)) {
                h = ((r - g) + (delta * 4f));
                h /= (6f * delta);
              }
            }
          }
        }
        return vec3f(h, s, v);
      }

      fn hsvToRgb(hsv: vec3f) -> vec3f {
        let h = hsv.x;
        let s = hsv.y;
        let v = hsv.z;
        let i = floor((h * 6f));
        let f = ((h * 6f) - i);
        let p = (v * (1f - s));
        let q = (v * (1f - (f * s)));
        let t = (v * (1f - ((1f - f) * s)));
        var r = 0f;
        var g = 0f;
        var b = 0f;
        if (((i % 6f) == 0f)) {
          r = v;
          g = t;
          b = p;
        }
        else {
          if (((i % 6f) == 1f)) {
            r = q;
            g = v;
            b = p;
          }
          else {
            if (((i % 6f) == 2f)) {
              r = p;
              g = v;
              b = t;
            }
            else {
              if (((i % 6f) == 3f)) {
                r = p;
                g = q;
                b = v;
              }
              else {
                if (((i % 6f) == 4f)) {
                  r = t;
                  g = p;
                  b = v;
                }
                else {
                  r = v;
                  g = p;
                  b = q;
                }
              }
            }
          }
        }
        return vec3f(r, g, b);
      }

      fn tintByFireColor(rgb: vec3f) -> vec3f {
        let hsv = rgbToHsv(rgb);
        let tint = (&shadingUniform.fireTint);
        return hsvToRgb(vec3f(fract(((hsv.x + (*tint).x) + 1f)), (hsv.y * (*tint).y), hsv.z));
      }

      struct smokeFragment_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn smokeFragment(_arg_0: smokeFragment_Input) -> @location(0) vec4f {
        let texel = sampleDisplay(_arg_0.uv);
        let density = texel.z;
        let rawTemperature = texel.w;
        let temperature = pow(rawTemperature, shadingUniform.tempPower);
        let t = (10f + (temperature * 30f));
        const r = 1;
        let g = clamp(((0.3900815788f * log(t)) - 0.6318414438f), 0f, 1f);
        let b = select(clamp(((0.5432067891f * log((t - 10f))) - 1.1962540891f), 0f, 1f), 0f, (t <= 19f));
        let color = tintByFireColor(vec3f(f32(r), g, b));
        let intensity = ((density * temperature) * 2.5f);
        let fireColor = (color * intensity);
        let fluidColor = (fireColor + vec3f(0.03999999910593033));
        let finalColor = mix(vec3f(0.10000000149011612, 0.10999999940395355, 0.14000000059604645), fluidColor, min(density, 1f));
        return vec4f(finalColor, 1f);
      }

      struct Particle {
        pos: vec2f,
        vel: vec2f,
        life: f32,
        maxLife: f32,
      }

      @group(1) @binding(0) var<storage, read> particles: array<Particle>;

      struct particleVertex_Output {
        @builtin(position) pos: vec4f,
        @location(0) life: f32,
        @location(1) offset: vec2f,
        @location(2) texUv: vec2f,
      }

      @group(1) @binding(1) var textTex: texture_2d<f32>;

      struct ShadingParams {
        fireTint: vec2f,
        tempPower: f32,
        particleSize: f32,
      }

      @group(0) @binding(0) var<uniform> shadingUniform: ShadingParams;

      @vertex fn particleVertex(@builtin(vertex_index) vIdx: u32, @builtin(instance_index) iIdx: u32) -> particleVertex_Output {
        let p = (&particles[iIdx]);
        if (((*p).life <= 0f)) {
          return particleVertex_Output(vec4f(-2000, -2000, 0, 1), 0f, vec2f(), vec2f());
        }
        let size = f32(textureDimensions(textTex).x);
        let offset = array<vec2f, 4>(vec2f(-1), vec2f(1, -1), vec2f(-1, 1), vec2f(1))[vIdx];
        let screenPos = ((((*p).pos / size) * 2f) - 1f);
        let finalPos = (screenPos + ((offset * shadingUniform.particleSize) / size));
        return particleVertex_Output(vec4f(finalPos.x, -(finalPos.y), 0f, 1f), ((*p).life / (*p).maxLife), offset, ((finalPos * 0.5f) + 0.5f));
      }

      fn rgbToHsv(rgb: vec3f) -> vec3f {
        let r = rgb.x;
        let g = rgb.y;
        let b = rgb.z;
        let maxC = max(r, max(g, b));
        let minC = min(r, min(g, b));
        let delta = (maxC - minC);
        var h = 0f;
        var s = 0f;
        if ((maxC == 0f)) {
          s = 0f;
        }
        else {
          s = (delta / maxC);
        }
        let v = maxC;
        if ((maxC == minC)) {
          h = 0f;
        }
        else {
          if ((maxC == r)) {
            var cond = 0f;
            if ((g < b)) {
              cond = 6f;
            }
            else {
              cond = 0f;
            }
            h = ((g - b) + (delta * cond));
            h /= (6f * delta);
          }
          else {
            if ((maxC == g)) {
              h = ((b - r) + (delta * 2f));
              h /= (6f * delta);
            }
            else {
              if ((maxC == b)) {
                h = ((r - g) + (delta * 4f));
                h /= (6f * delta);
              }
            }
          }
        }
        return vec3f(h, s, v);
      }

      fn hsvToRgb(hsv: vec3f) -> vec3f {
        let h = hsv.x;
        let s = hsv.y;
        let v = hsv.z;
        let i = floor((h * 6f));
        let f = ((h * 6f) - i);
        let p = (v * (1f - s));
        let q = (v * (1f - (f * s)));
        let t = (v * (1f - ((1f - f) * s)));
        var r = 0f;
        var g = 0f;
        var b = 0f;
        if (((i % 6f) == 0f)) {
          r = v;
          g = t;
          b = p;
        }
        else {
          if (((i % 6f) == 1f)) {
            r = q;
            g = v;
            b = p;
          }
          else {
            if (((i % 6f) == 2f)) {
              r = p;
              g = v;
              b = t;
            }
            else {
              if (((i % 6f) == 3f)) {
                r = p;
                g = q;
                b = v;
              }
              else {
                if (((i % 6f) == 4f)) {
                  r = t;
                  g = p;
                  b = v;
                }
                else {
                  r = v;
                  g = p;
                  b = q;
                }
              }
            }
          }
        }
        return vec3f(r, g, b);
      }

      fn tintByFireColor(rgb: vec3f) -> vec3f {
        let hsv = rgbToHsv(rgb);
        let tint = (&shadingUniform.fireTint);
        return hsvToRgb(vec3f(fract(((hsv.x + (*tint).x) + 1f)), (hsv.y * (*tint).y), hsv.z));
      }

      struct particleFragment_Input {
        @location(0) life: f32,
        @location(1) offset: vec2f,
        @location(2) texUv: vec2f,
      }

      @fragment fn particleFragment(_arg_0: particleFragment_Input) -> @location(0) vec4f {
        let dist = length(_arg_0.offset);
        let falloff = (1f - smoothstep(0f, 1f, dist));
        let intensity = max(0f, _arg_0.life);
        let size = f32(textureDimensions(textTex).x);
        let uvC = clamp(_arg_0.texUv, vec2f(), vec2f(0.9998999834060669));
        let mask = textureLoad(textTex, vec2i((uvC * size)), 0).x;
        let occlusion = (1f - smoothstep(0.15f, 0.45f, mask));
        let a = ((intensity * falloff) * occlusion);
        return vec4f((tintByFireColor(vec3f(1, 0.5, 0.10000000149011612)) * a), 1f);
      }"
    `);
  });
});
