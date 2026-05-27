/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';

describe('fluid with atomics example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simulation',
        name: 'fluid-with-atomics',
        expectedCalls: 3,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct BrushParams {
        start: vec2f,
        end: vec2f,
        radius: f32,
        cellKind: u32,
        waterAmount: u32,
        erasing: u32,
      }

      @group(0) @binding(1) var<uniform> brushParams: BrushParams;

      fn sdLine(point: vec2f, A: vec2f, B: vec2f) -> f32 {
        let pa = (point - A);
        let ba = (B - A);
        let h = max(0f, min(1f, (dot(pa, ba) / dot(ba, ba))));
        return distance(pa, (ba * h));
      }

      struct SimParams {
        resolution: vec2u,
        viscosity: u32,
      }

      @group(0) @binding(2) var<uniform> simParams: SimParams;

      fn getIndex(coord: vec2u) -> u32 {
        return ((coord.y * simParams.resolution.x) + coord.x);
      }

      @group(1) @binding(0) var<storage, read_write> flags: array<u32>;

      @group(1) @binding(1) var<storage, read_write> currentWater: array<u32>;

      @group(1) @binding(2) var<storage, read_write> nextWater: array<atomic<u32>>;

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        let brushPoint = vec2f(f32(x), f32(y));
        let brush = (&brushParams);
        var brushDistance = 0f;
        if ((((*brush).start.x == (*brush).end.x) && ((*brush).start.y == (*brush).end.y))) {
          brushDistance = distance(brushPoint, (*brush).start);
        }
        else {
          brushDistance = sdLine(brushPoint, (*brush).start, (*brush).end);
        }
        if ((brushDistance > (*brush).radius)) {
          return;
        }
        let index = getIndex(vec2u(x, y));
        if (((*brush).erasing != 0u)) {
          flags[index] = 0u;
          currentWater[index] = 0u;
          atomicStore(&nextWater[index], 0u);
          return;
        }
        if (((*brush).waterAmount != 0u)) {
          if ((flags[index] == 0u)) {
            currentWater[index] = (*brush).waterAmount;
            atomicStore(&nextWater[index], (*brush).waterAmount);
          }
          return;
        }
        flags[index] = (*brush).cellKind;
        currentWater[index] = 0u;
        atomicStore(&nextWater[index], 0u);
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        wrappedCallback(id.x, id.y, id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct SimParams {
        resolution: vec2u,
        viscosity: u32,
      }

      @group(0) @binding(1) var<uniform> simParams: SimParams;

      fn getIndex(coord: vec2u) -> u32 {
        return ((coord.y * simParams.resolution.x) + coord.x);
      }

      @group(1) @binding(0) var<storage, read> flags: array<u32>;

      fn getFlags(coord: vec2u) -> u32 {
        return flags[getIndex(coord)];
      }

      fn isBoundary(coord: vec2u) -> bool {
        return ((((coord.x == 0u) || (coord.y == 0u)) || (coord.x == (simParams.resolution.x - 1u))) || (coord.y == (simParams.resolution.y - 1u)));
      }

      @group(1) @binding(2) var<storage, read_write> nextWater: array<atomic<u32>>;

      fn clearNextWater(coord: vec2u) {
        atomicStore(&nextWater[getIndex(coord)], 0u);
      }

      fn isInBounds(coord: vec2u) -> bool {
        return ((coord.x < simParams.resolution.x) && (coord.y < simParams.resolution.y));
      }

      fn isDrainTarget(coord: vec2u) -> bool {
        return ((!isInBounds(coord) || (getFlags(coord) == 3u)) || isBoundary(coord));
      }

      fn canStoreWater(coord: vec2u) -> bool {
        return (!isDrainTarget(coord) && (getFlags(coord) != 1u));
      }

      const MAX_WATER_LEVEL: u32 = 16777215u;

      fn addNextWater(coord: vec2u, amount: u32) {
        if (((amount == 0u) || !canStoreWater(coord))) {
          return;
        }
        let index = getIndex(coord);
        let previous = atomicAdd(&nextWater[index], amount);
        if (((previous + amount) > MAX_WATER_LEVEL)) {
          atomicMin(&nextWater[index], MAX_WATER_LEVEL);
        }
      }

      const SOURCE_RATE: u32 = 20u;

      fn handleCellFlags(coord: vec2u) -> bool {
        let flags_1 = getFlags(coord);
        if ((((flags_1 == 1u) || (flags_1 == 3u)) || isBoundary(coord))) {
          clearNextWater(coord);
          return true;
        }
        if ((flags_1 == 2u)) {
          addNextWater(coord, SOURCE_RATE);
        }
        return false;
      }

      @group(1) @binding(1) var<storage, read> currentWater: array<u32>;

      fn getWaterLevel(coord: vec2u) -> u32 {
        return currentWater[getIndex(coord)];
      }

      fn isFlowBlocked(coord: vec2u) -> bool {
        return (!isInBounds(coord) || (getFlags(coord) == 1u));
      }

      fn getTargetWaterLevel(coord: vec2u) -> u32 {
        if (isDrainTarget(coord)) {
          return 0u;
        }
        return getWaterLevel(coord);
      }

      const MAX_WATER_LEVEL_UNPRESSURIZED: u32 = 255u;

      const MAX_PRESSURE: u32 = 12u;

      fn getStableStateBelow(upper: u32, lower: u32) -> u32 {
        let totalMass = (upper + lower);
        if ((totalMass <= MAX_WATER_LEVEL_UNPRESSURIZED)) {
          return totalMass;
        }
        if (((totalMass >= (MAX_WATER_LEVEL_UNPRESSURIZED * 2u)) && (upper > lower))) {
          return (u32((f32(totalMass) / 2f)) + MAX_PRESSURE);
        }
        return MAX_WATER_LEVEL_UNPRESSURIZED;
      }

      fn subtractNextWater(coord: vec2u, amount: u32) {
        if ((amount == 0u)) {
          return;
        }
        atomicSub(&nextWater[getIndex(coord)], amount);
      }

      fn applyFlow(source: vec2u, target_1: vec2u, amount: u32) {
        subtractNextWater(source, amount);
        if (!isDrainTarget(target_1)) {
          addNextWater(target_1, amount);
        }
      }

      fn flowDown(coord: vec2u, remainingWater: ptr<function, u32>) {
        if ((((*remainingWater) == 0u) || (coord.y == 0u))) {
          return;
        }
        let target_1 = vec2u(coord.x, (coord.y - 1u));
        if (isFlowBlocked(target_1)) {
          return;
        }
        let targetWater = getTargetWaterLevel(target_1);
        let stable = getStableStateBelow((*remainingWater), targetWater);
        if ((targetWater >= stable)) {
          return;
        }
        let flow = min((stable - targetWater), simParams.viscosity);
        applyFlow(coord, target_1, flow);
        (*remainingWater) -= flow;
      }

      fn flowSideways(coord: vec2u, remainingWater: ptr<function, u32>, waterLevelBefore: u32, left: bool) {
        if (((*remainingWater) == 0u)) {
          return;
        }
        if ((left && (coord.x == 0u))) {
          return;
        }
        if ((!left && ((coord.x + 1u) >= simParams.resolution.x))) {
          return;
        }
        let targetX = select((coord.x + 1u), (coord.x - 1u), left);
        let target_1 = vec2u(targetX, coord.y);
        if (isFlowBlocked(target_1)) {
          return;
        }
        let flowRaw = (i32(waterLevelBefore) - i32(getTargetWaterLevel(target_1)));
        if ((flowRaw <= 0i)) {
          return;
        }
        let change = max(min(4u, (*remainingWater)), u32((f32(flowRaw) / 4f)));
        let flow = min(change, simParams.viscosity);
        applyFlow(coord, target_1, flow);
        (*remainingWater) -= flow;
      }

      fn flowUp(coord: vec2u, remainingWater: ptr<function, u32>) {
        if ((((*remainingWater) == 0u) || ((coord.y + 1u) >= simParams.resolution.y))) {
          return;
        }
        let target_1 = vec2u(coord.x, (coord.y + 1u));
        if (isFlowBlocked(target_1)) {
          return;
        }
        let stable = getStableStateBelow(getTargetWaterLevel(target_1), (*remainingWater));
        if ((stable >= (*remainingWater))) {
          return;
        }
        let flow = min(((*remainingWater) - stable), simParams.viscosity);
        applyFlow(coord, target_1, flow);
        (*remainingWater) -= flow;
      }

      fn wrappedCallback(x: u32, y: u32, _arg_2: u32) {
        let coord = vec2u(x, y);
        if (handleCellFlags(coord)) {
          return;
        }
        var remainingWater = getWaterLevel(coord);
        if ((remainingWater == 0u)) {
          return;
        }
        flowDown(coord, (&remainingWater));
        let waterLevelBefore = remainingWater;
        flowSideways(coord, (&remainingWater), waterLevelBefore, true);
        flowSideways(coord, (&remainingWater), waterLevelBefore, false);
        flowUp(coord, (&remainingWater));
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(@builtin(global_invocation_id) id: vec3u) {
        if (any(id >= sizeUniform)) {
          return;
        }
        wrappedCallback(id.x, id.y, id.z);
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

      struct SimParams {
        resolution: vec2u,
        viscosity: u32,
      }

      @group(0) @binding(0) var<uniform> simParams: SimParams;

      fn coordFromUv(uv: vec2f) -> vec2u {
        let clampedUv = saturate(uv);
        let gridUv = vec2f(clampedUv.x, (1f - clampedUv.y));
        let resolution = vec2f(simParams.resolution);
        return vec2u(min((gridUv * resolution), (resolution - 1f)));
      }

      fn getIndex(coord: vec2u) -> u32 {
        return ((coord.y * simParams.resolution.x) + coord.x);
      }

      @group(1) @binding(0) var<storage, read> flags: array<u32>;

      fn getFlags(coord: vec2u) -> u32 {
        return flags[getIndex(coord)];
      }

      @group(1) @binding(1) var<storage, read> currentWater: array<u32>;

      fn getWaterLevel(coord: vec2u) -> u32 {
        return currentWater[getIndex(coord)];
      }

      struct FragmentIn {
        @location(0) uv: vec2f,
      }

      @fragment fn fragment(_arg_0: FragmentIn) -> @location(0) vec4f {
        let coord = coordFromUv(_arg_0.uv);
        let flags_1 = getFlags(coord);
        if ((flags_1 == 1u)) {
          return vec4f(0.5, 0.5, 0.5, 1);
        }
        if ((flags_1 == 2u)) {
          return vec4f(0, 1, 0, 1);
        }
        if ((flags_1 == 3u)) {
          return vec4f(1, 0, 0, 1);
        }
        let normalized = min((f32(getWaterLevel(coord)) / 255f), 1f);
        if ((normalized == 0f)) {
          return vec4f();
        }
        let water = (1f / (1f + exp((-((normalized - 0.2f)) * 10f))));
        return vec4f(0f, 0f, water, water);
      }"
    `);
  });
});
