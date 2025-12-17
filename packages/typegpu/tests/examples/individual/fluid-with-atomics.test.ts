/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('fluid with atomics example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'fluid-with-atomics',
      expectedCalls: 2,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> size_6: vec2u;

      fn getIndex_5(x: u32, y: u32) -> u32 {
        let h = size_6.y;
        let w = size_6.x;
        return (((y % h) * w) + (x % w));
      }

      @group(0) @binding(1) var<storage, read> currentStateBuffer_7: array<u32, 1048576>;

      fn getCell_4(x: u32, y: u32) -> u32 {
        return currentStateBuffer_7[getIndex_5(x, y)];
      }

      fn isClearCell_3(x: u32, y: u32) -> bool {
        return ((getCell_4(x, y) >> 24u) == 4u);
      }

      @group(0) @binding(2) var<storage, read_write> nextState_9: array<atomic<u32>, 1048576>;

      fn updateCell_8(x: u32, y: u32, value: u32) {
        atomicStore(&nextState_9[getIndex_5(x, y)], value);
      }

      fn isWall_10(x: u32, y: u32) -> bool {
        return ((getCell_4(x, y) >> 24u) == 1u);
      }

      const MAX_WATER_LEVEL_12: u32 = 16777215u;

      fn persistFlags_11(x: u32, y: u32) {
        let cell = getCell_4(x, y);
        let waterLevel = (cell & MAX_WATER_LEVEL_12);
        let flags = (cell >> 24u);
        updateCell_8(x, y, ((flags << 24u) | waterLevel));
      }

      fn isWaterSource_13(x: u32, y: u32) -> bool {
        return ((getCell_4(x, y) >> 24u) == 2u);
      }

      fn getCellNext_15(x: u32, y: u32) -> u32 {
        return atomicLoad(&nextState_9[getIndex_5(x, y)]);
      }

      fn addToCell_14(x: u32, y: u32, value: u32) {
        let cell = getCellNext_15(x, y);
        let waterLevel = (cell & MAX_WATER_LEVEL_12);
        let newWaterLevel = min((waterLevel + value), MAX_WATER_LEVEL_12);
        atomicAdd(&nextState_9[getIndex_5(x, y)], (newWaterLevel - waterLevel));
      }

      fn isWaterDrain_16(x: u32, y: u32) -> bool {
        return ((getCell_4(x, y) >> 24u) == 3u);
      }

      fn getWaterLevel_17(x: u32, y: u32) -> u32 {
        return (getCell_4(x, y) & MAX_WATER_LEVEL_12);
      }

      fn subtractFromCell_18(x: u32, y: u32, value: u32) {
        let cell = getCellNext_15(x, y);
        let waterLevel = (cell & MAX_WATER_LEVEL_12);
        let newWaterLevel = max((waterLevel - min(value, waterLevel)), 0u);
        atomicSub(&nextState_9[getIndex_5(x, y)], (waterLevel - newWaterLevel));
      }

      fn checkForFlagsAndBounds_2(x: u32, y: u32) -> bool {
        if (isClearCell_3(x, y)) {
          updateCell_8(x, y, 0u);
          return true;
        }
        if (isWall_10(x, y)) {
          persistFlags_11(x, y);
          return true;
        }
        if (isWaterSource_13(x, y)) {
          persistFlags_11(x, y);
          addToCell_14(x, y, 20u);
          return false;
        }
        if (isWaterDrain_16(x, y)) {
          persistFlags_11(x, y);
          updateCell_8(x, y, (3 << 24));
          return true;
        }
        if (((((y == 0u) || (y == (size_6.y - 1u))) || (x == 0u)) || (x == (size_6.x - 1u)))) {
          subtractFromCell_18(x, y, getWaterLevel_17(x, y));
          return true;
        }
        return false;
      }

      const MAX_WATER_LEVEL_UNPRESSURIZED_20: u32 = 255u;

      const MAX_PRESSURE_21: u32 = 12u;

      fn getStableStateBelow_19(upper: u32, lower: u32) -> u32 {
        let totalMass = (upper + lower);
        if ((totalMass <= MAX_WATER_LEVEL_UNPRESSURIZED_20)) {
          return totalMass;
        }
        if (((totalMass >= (MAX_WATER_LEVEL_UNPRESSURIZED_20 * 2u)) && (upper > lower))) {
          return (u32((f32(totalMass) / 2f)) + MAX_PRESSURE_21);
        }
        return MAX_WATER_LEVEL_UNPRESSURIZED_20;
      }

      @group(0) @binding(3) var<uniform> viscosity_22: u32;

      fn decideWaterLevel_1(x: u32, y: u32) {
        if (checkForFlagsAndBounds_2(x, y)) {
          return;
        }
        var remainingWater = getWaterLevel_17(x, y);
        if ((remainingWater == 0u)) {
          return;
        }
        if (!isWall_10(x, (y - 1u))) {
          let waterLevelBelow = getWaterLevel_17(x, (y - 1u));
          let stable = getStableStateBelow_19(remainingWater, waterLevelBelow);
          if ((waterLevelBelow < stable)) {
            let change = (stable - waterLevelBelow);
            let flow = min(change, viscosity_22);
            subtractFromCell_18(x, y, flow);
            addToCell_14(x, (y - 1u), flow);
            remainingWater -= flow;
          }
        }
        if ((remainingWater == 0u)) {
          return;
        }
        let waterLevelBefore = remainingWater;
        if (!isWall_10((x - 1u), y)) {
          let flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel_17((x - 1u), y)));
          if ((flowRaw > 0i)) {
            let change = max(min(4u, remainingWater), u32((f32(flowRaw) / 4f)));
            let flow = min(change, viscosity_22);
            subtractFromCell_18(x, y, flow);
            addToCell_14((x - 1u), y, flow);
            remainingWater -= flow;
          }
        }
        if ((remainingWater == 0u)) {
          return;
        }
        if (!isWall_10((x + 1u), y)) {
          let flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel_17((x + 1u), y)));
          if ((flowRaw > 0i)) {
            let change = max(min(4u, remainingWater), u32((f32(flowRaw) / 4f)));
            let flow = min(change, viscosity_22);
            subtractFromCell_18(x, y, flow);
            addToCell_14((x + 1u), y, flow);
            remainingWater -= flow;
          }
        }
        if ((remainingWater == 0u)) {
          return;
        }
        if (!isWall_10(x, (y + 1u))) {
          let stable = getStableStateBelow_19(getWaterLevel_17(x, (y + 1u)), remainingWater);
          if ((stable < remainingWater)) {
            let flow = min((remainingWater - stable), viscosity_22);
            subtractFromCell_18(x, y, flow);
            addToCell_14(x, (y + 1u), flow);
            remainingWater -= flow;
          }
        }
      }

      struct compute_Input_23 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1, 1) fn compute_0(input: compute_Input_23) {
        decideWaterLevel_1(input.gid.x, input.gid.y);
      }

      @group(0) @binding(0) var<uniform> size_1: vec2u;

      struct vertex_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) cell: f32,
      }

      struct vertex_Input_3 {
        @location(0) squareData: vec2f,
        @location(1) currentStateData: u32,
        @builtin(instance_index) idx: u32,
      }

      @vertex fn vertex_0(input: vertex_Input_3) -> vertex_Output_2 {
        let w = size_1.x;
        let h = size_1.y;
        let gridX = (input.idx % w);
        let gridY = u32((f32(input.idx) / f32(w)));
        let maxDim = max(w, h);
        let x = (((2f * (f32(gridX) + input.squareData.x)) - f32(w)) / f32(maxDim));
        let y = (((2f * (f32(gridY) + input.squareData.y)) - f32(h)) / f32(maxDim));
        let cellFlags = (input.currentStateData >> 24u);
        var cell = f32((input.currentStateData & 16777215u));
        if ((cellFlags == 1u)) {
          cell = -1f;
        }
        if ((cellFlags == 2u)) {
          cell = -2f;
        }
        if ((cellFlags == 3u)) {
          cell = -3f;
        }
        return vertex_Output_2(vec4f(x, y, 0f, 1f), cell);
      }

      struct fragment_Input_5 {
        @location(0) cell: f32,
      }

      @fragment fn fragment_4(input: fragment_Input_5) -> @location(0) vec4f {
        if ((input.cell == -1f)) {
          return vec4f(0.5, 0.5, 0.5, 1);
        }
        if ((input.cell == -2f)) {
          return vec4f(0, 1, 0, 1);
        }
        if ((input.cell == -3f)) {
          return vec4f(1, 0, 0, 1);
        }
        let normalized = min((input.cell / 255f), 1f);
        if ((normalized == 0f)) {
          return vec4f();
        }
        let res = (1f / (1f + exp((-((normalized - 0.2f)) * 10f))));
        return vec4f(0f, 0f, res, res);
      }"
    `);
  });
});
