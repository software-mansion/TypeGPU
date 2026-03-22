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
        expectedCalls: 2,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> size: vec2u;

      fn getIndex(x: u32, y: u32) -> u32 {
        let h = size.y;
        let w = size.x;
        return (((y % h) * w) + (x % w));
      }

      @group(0) @binding(1) var<storage, read> currentStateBuffer: array<u32, 1048576>;

      fn getCell(x: u32, y: u32) -> u32 {
        return currentStateBuffer[getIndex(x, y)];
      }

      fn isClearCell(x: u32, y: u32) -> bool {
        return ((getCell(x, y) >> 24u) == 4u);
      }

      @group(0) @binding(2) var<storage, read_write> nextState: array<atomic<u32>, 1048576>;

      fn updateCell(x: u32, y: u32, value: u32) {
        atomicStore(&nextState[getIndex(x, y)], value);
      }

      fn isWall(x: u32, y: u32) -> bool {
        return ((getCell(x, y) >> 24u) == 1u);
      }

      const MAX_WATER_LEVEL: u32 = 16777215u;

      fn persistFlags(x: u32, y: u32) {
        let cell = getCell(x, y);
        let waterLevel = (cell & MAX_WATER_LEVEL);
        let flags = (cell >> 24u);
        updateCell(x, y, ((flags << 24u) | waterLevel));
      }

      fn isWaterSource(x: u32, y: u32) -> bool {
        return ((getCell(x, y) >> 24u) == 2u);
      }

      fn getCellNext(x: u32, y: u32) -> u32 {
        return atomicLoad(&nextState[getIndex(x, y)]);
      }

      fn addToCell(x: u32, y: u32, value: u32) {
        let cell = getCellNext(x, y);
        let waterLevel = (cell & MAX_WATER_LEVEL);
        let newWaterLevel = min((waterLevel + value), MAX_WATER_LEVEL);
        atomicAdd(&nextState[getIndex(x, y)], (newWaterLevel - waterLevel));
      }

      fn isWaterDrain(x: u32, y: u32) -> bool {
        return ((getCell(x, y) >> 24u) == 3u);
      }

      fn getWaterLevel(x: u32, y: u32) -> u32 {
        return (getCell(x, y) & MAX_WATER_LEVEL);
      }

      fn subtractFromCell(x: u32, y: u32, value: u32) {
        let cell = getCellNext(x, y);
        let waterLevel = (cell & MAX_WATER_LEVEL);
        let newWaterLevel = max((waterLevel - min(value, waterLevel)), 0u);
        atomicSub(&nextState[getIndex(x, y)], (waterLevel - newWaterLevel));
      }

      fn checkForFlagsAndBounds(x: u32, y: u32) -> bool {
        if (isClearCell(x, y)) {
          updateCell(x, y, 0u);
          return true;
        }
        if (isWall(x, y)) {
          persistFlags(x, y);
          return true;
        }
        if (isWaterSource(x, y)) {
          persistFlags(x, y);
          addToCell(x, y, 20u);
          return false;
        }
        if (isWaterDrain(x, y)) {
          persistFlags(x, y);
          updateCell(x, y, (3 << 24u));
          return true;
        }
        if (((((y == 0u) || (y == (size.y - 1u))) || (x == 0u)) || (x == (size.x - 1u)))) {
          subtractFromCell(x, y, getWaterLevel(x, y));
          return true;
        }
        return false;
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

      @group(0) @binding(3) var<uniform> viscosity: u32;

      fn decideWaterLevel(x: u32, y: u32) {
        if (checkForFlagsAndBounds(x, y)) {
          return;
        }
        var remainingWater = getWaterLevel(x, y);
        if ((remainingWater == 0u)) {
          return;
        }
        if (!isWall(x, (y - 1u))) {
          let waterLevelBelow = getWaterLevel(x, (y - 1u));
          let stable = getStableStateBelow(remainingWater, waterLevelBelow);
          if ((waterLevelBelow < stable)) {
            let change = (stable - waterLevelBelow);
            let flow = min(change, viscosity);
            subtractFromCell(x, y, flow);
            addToCell(x, (y - 1u), flow);
            remainingWater -= flow;
          }
        }
        if ((remainingWater == 0u)) {
          return;
        }
        let waterLevelBefore = remainingWater;
        if (!isWall((x - 1u), y)) {
          let flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel((x - 1u), y)));
          if ((flowRaw > 0i)) {
            let change = max(min(4u, remainingWater), u32((f32(flowRaw) / 4f)));
            let flow = min(change, viscosity);
            subtractFromCell(x, y, flow);
            addToCell((x - 1u), y, flow);
            remainingWater -= flow;
          }
        }
        if ((remainingWater == 0u)) {
          return;
        }
        if (!isWall((x + 1u), y)) {
          let flowRaw = (i32(waterLevelBefore) - i32(getWaterLevel((x + 1u), y)));
          if ((flowRaw > 0i)) {
            let change = max(min(4u, remainingWater), u32((f32(flowRaw) / 4f)));
            let flow = min(change, viscosity);
            subtractFromCell(x, y, flow);
            addToCell((x + 1u), y, flow);
            remainingWater -= flow;
          }
        }
        if ((remainingWater == 0u)) {
          return;
        }
        if (!isWall(x, (y + 1u))) {
          let stable = getStableStateBelow(getWaterLevel(x, (y + 1u)), remainingWater);
          if ((stable < remainingWater)) {
            let flow = min((remainingWater - stable), viscosity);
            subtractFromCell(x, y, flow);
            addToCell(x, (y + 1u), flow);
            remainingWater -= flow;
          }
        }
      }

      @compute @workgroup_size(1, 1) fn compute(@builtin(global_invocation_id) _arg_gid: vec3u) {
        decideWaterLevel(_arg_gid.x, _arg_gid.y);
      }

      @group(0) @binding(0) var<uniform> size: vec2u;

      struct vertex_Output {
        @builtin(position) pos: vec4f,
        @location(0) cell: f32,
      }

      @vertex fn vertex(@location(0) _arg_squareData: vec2f, @location(1) _arg_currentStateData: u32, @builtin(instance_index) _arg_idx: u32) -> vertex_Output {
        let w = size.x;
        let h = size.y;
        let gridX = (_arg_idx % w);
        let gridY = u32((f32(_arg_idx) / f32(w)));
        let maxDim = max(w, h);
        let x = (((2f * (f32(gridX) + _arg_squareData.x)) - f32(w)) / f32(maxDim));
        let y = (((2f * (f32(gridY) + _arg_squareData.y)) - f32(h)) / f32(maxDim));
        let cellFlags = (_arg_currentStateData >> 24u);
        var cell = f32((_arg_currentStateData & 16777215u));
        if ((cellFlags == 1u)) {
          cell = -1f;
        }
        if ((cellFlags == 2u)) {
          cell = -2f;
        }
        if ((cellFlags == 3u)) {
          cell = -3f;
        }
        return vertex_Output(vec4f(x, y, 0f, 1f), cell);
      }

      struct fragment_Input {
        @location(0) cell: f32,
      }

      @fragment fn fragment(_arg_0: fragment_Input) -> @location(0) vec4f {
        if ((_arg_0.cell == -1f)) {
          return vec4f(0.5, 0.5, 0.5, 1);
        }
        if ((_arg_0.cell == -2f)) {
          return vec4f(0, 1, 0, 1);
        }
        if ((_arg_0.cell == -3f)) {
          return vec4f(1, 0, 0, 1);
        }
        let normalized = min((_arg_0.cell / 255f), 1f);
        if ((normalized == 0f)) {
          return vec4f();
        }
        let res = (1f / (1f + exp((-((normalized - 0.2f)) * 10f))));
        return vec4f(0f, 0f, res, res);
      }"
    `);
  });
});
