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
      "@group(0) @binding(0) var<uniform> size_5: vec2u;

      fn getIndex_4(x: u32, y: u32) -> u32 {
        var h = size_5.y;
        var w = size_5.x;
        return (((y % h) * w) + (x % w));
      }

      @group(0) @binding(1) var<storage, read_write> nextState_6: array<atomic<u32>, 1048576>;

      fn updateCell_3(x: u32, y: u32, value: u32) {
        atomicStore(&nextState_6[getIndex_4(x, y)], value);
      }

      @group(0) @binding(2) var<storage, read> currentStateBuffer_9: array<u32, 1048576>;

      fn getCell_8(x: u32, y: u32) -> u32 {
        return currentStateBuffer_9[getIndex_4(x, y)];
      }

      fn isClearCell_7(x: u32, y: u32) -> bool {
        return ((getCell_8(x, y) >> 24) == 4);
      }

      const MAX_WATER_LEVEL_11: u32 = 16777215;

      fn persistFlags_10(x: u32, y: u32) {
        var cell = getCell_8(x, y);
        var waterLevel = (cell & MAX_WATER_LEVEL_11);
        var flags = (cell >> 24);
        updateCell_3(x, y, ((flags << 24) | waterLevel));
      }

      fn isWall_12(x: u32, y: u32) -> bool {
        return ((getCell_8(x, y) >> 24) == 1);
      }

      fn getCellNext_14(x: u32, y: u32) -> u32 {
        return atomicLoad(&nextState_6[getIndex_4(x, y)]);
      }

      fn addToCell_13(x: u32, y: u32, value: u32) {
        var cell = getCellNext_14(x, y);
        var waterLevel = (cell & MAX_WATER_LEVEL_11);
        var newWaterLevel = min((waterLevel + value), MAX_WATER_LEVEL_11);
        atomicAdd(&nextState_6[getIndex_4(x, y)], (newWaterLevel - waterLevel));
      }

      fn isWaterSource_15(x: u32, y: u32) -> bool {
        return ((getCell_8(x, y) >> 24) == 2);
      }

      fn isWaterDrain_16(x: u32, y: u32) -> bool {
        return ((getCell_8(x, y) >> 24) == 3);
      }

      fn subtractFromCell_17(x: u32, y: u32, value: u32) {
        var cell = getCellNext_14(x, y);
        var waterLevel = (cell & MAX_WATER_LEVEL_11);
        var newWaterLevel = max((waterLevel - min(value, waterLevel)), 0);
        atomicSub(&nextState_6[getIndex_4(x, y)], (waterLevel - newWaterLevel));
      }

      fn getWaterLevel_18(x: u32, y: u32) -> u32 {
        return (getCell_8(x, y) & MAX_WATER_LEVEL_11);
      }

      fn checkForFlagsAndBounds_2(x: u32, y: u32) -> bool {
        if (isClearCell_7(x, y)) {
          updateCell_3(x, y, 0);
          return true;
        }
        if (isWall_12(x, y)) {
          persistFlags_10(x, y);
          return true;
        }
        if (isWaterSource_15(x, y)) {
          persistFlags_10(x, y);
          addToCell_13(x, y, 20);
          return false;
        }
        if (isWaterDrain_16(x, y)) {
          persistFlags_10(x, y);
          updateCell_3(x, y, (3 << 24));
          return true;
        }
        if (((((y == 0) || (y == (size_5.y - 1))) || (x == 0)) || (x == (size_5.x - 1)))) {
          subtractFromCell_17(x, y, getWaterLevel_18(x, y));
          return true;
        }
        return false;
      }

      const MAX_WATER_LEVEL_UNPRESSURIZED_20: u32 = 255;

      const MAX_PRESSURE_21: u32 = 12;

      fn getStableStateBelow_19(upper: u32, lower: u32) -> u32 {
        var totalMass = (upper + lower);
        if ((totalMass <= MAX_WATER_LEVEL_UNPRESSURIZED_20)) {
          return totalMass;
        }
        if (((totalMass >= (MAX_WATER_LEVEL_UNPRESSURIZED_20 * 2)) && (upper > lower))) {
          return (u32((f32(totalMass) / 2f)) + MAX_PRESSURE_21);
        }
        return MAX_WATER_LEVEL_UNPRESSURIZED_20;
      }

      @group(0) @binding(3) var<uniform> viscosity_22: u32;

      fn decideWaterLevel_1(x: u32, y: u32) {
        if (checkForFlagsAndBounds_2(x, y)) {
          return;
        }
        var remainingWater = getWaterLevel_18(x, y);
        if ((remainingWater == 0)) {
          return;
        }
        if (!isWall_12(x, (y - 1))) {
          var waterLevelBelow = getWaterLevel_18(x, (y - 1));
          var stable = getStableStateBelow_19(remainingWater, waterLevelBelow);
          if ((waterLevelBelow < stable)) {
            var change = (stable - waterLevelBelow);
            var flow = min(change, viscosity_22);
            subtractFromCell_17(x, y, flow);
            addToCell_13(x, (y - 1), flow);
            remainingWater -= flow;
          }
        }
        if ((remainingWater == 0)) {
          return;
        }
        var waterLevelBefore = remainingWater;
        if (!isWall_12((x - 1), y)) {
          var flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel_18((x - 1), y)));
          if ((flowRaw > 0)) {
            var change = max(min(4, remainingWater), u32((f32(flowRaw) / 4f)));
            var flow = min(change, viscosity_22);
            subtractFromCell_17(x, y, flow);
            addToCell_13((x - 1), y, flow);
            remainingWater -= flow;
          }
        }
        if ((remainingWater == 0)) {
          return;
        }
        if (!isWall_12((x + 1), y)) {
          var flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel_18((x + 1), y)));
          if ((flowRaw > 0)) {
            var change = max(min(4, remainingWater), u32((f32(flowRaw) / 4f)));
            var flow = min(change, viscosity_22);
            subtractFromCell_17(x, y, flow);
            addToCell_13((x + 1), y, flow);
            remainingWater -= flow;
          }
        }
        if ((remainingWater == 0)) {
          return;
        }
        if (!isWall_12(x, (y + 1))) {
          var stable = getStableStateBelow_19(getWaterLevel_18(x, (y + 1)), remainingWater);
          if ((stable < remainingWater)) {
            var flow = min((remainingWater - stable), viscosity_22);
            subtractFromCell_17(x, y, flow);
            addToCell_13(x, (y + 1), flow);
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
        var w = size_1.x;
        var h = size_1.y;
        var gridX = (input.idx % w);
        var gridY = u32((f32(input.idx) / f32(w)));
        var maxDim = max(w, h);
        var x = (((2 * (f32(gridX) + input.squareData.x)) - f32(w)) / f32(maxDim));
        var y = (((2 * (f32(gridY) + input.squareData.y)) - f32(h)) / f32(maxDim));
        var cellFlags = (input.currentStateData >> 24);
        var cell = f32((input.currentStateData & 16777215));
        if ((cellFlags == 1)) {
          cell = -1;
        }
        if ((cellFlags == 2)) {
          cell = -2;
        }
        if ((cellFlags == 3)) {
          cell = -3;
        }
        return vertex_Output_2(vec4f(x, y, 0, 1), cell);
      }

      struct fragment_Input_5 {
        @location(0) cell: f32,
      }

      @fragment fn fragment_4(input: fragment_Input_5) -> @location(0) vec4f {
        if ((input.cell == -1)) {
          return vec4f(0.5, 0.5, 0.5, 1);
        }
        if ((input.cell == -2)) {
          return vec4f(0, 1, 0, 1);
        }
        if ((input.cell == -3)) {
          return vec4f(1, 0, 0, 1);
        }
        var normalized = min((input.cell / 255f), 1);
        if ((normalized == 0)) {
          return vec4f();
        }
        var res = (1f / (1 + exp((-(normalized - 0.2) * 10))));
        return vec4f(0, 0, res, res);
      }"
    `);
  });
});
