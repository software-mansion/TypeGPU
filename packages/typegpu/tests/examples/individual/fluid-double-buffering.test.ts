/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('fluid double buffering example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simulation',
      name: 'fluid-double-buffering',
      expectedCalls: 4,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "fn coordsToIndex_1(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      fn isValidCoord_3(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_6 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(0) var<storage, read> obstacles_5: array<BoxObstacle_6, 4>;

      fn isInsideObstacle_4(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_5[obsIdx];
          if ((obs.enabled == 0)) {
            continue;
          }
          var minX = max(0, (obs.center.x - i32((f32(obs.size.x) / 2f))));
          var maxX = min(256, (obs.center.x + i32((f32(obs.size.x) / 2f))));
          var minY = max(0, (obs.center.y - i32((f32(obs.size.y) / 2f))));
          var maxY = min(256, (obs.center.y + i32((f32(obs.size.y) / 2f))));
          if (((((x >= minX) && (x <= maxX)) && (y >= minY)) && (y <= maxY))) {
            return true;
          }
        }
        return false;
      }

      fn isValidFlowOut_2(x: i32, y: i32) -> bool {
        if (!isValidCoord_3(x, y)) {
          return false;
        }
        if (isInsideObstacle_4(x, y)) {
          return false;
        }
        return true;
      }

      @group(0) @binding(1) var<storage, read_write> gridBetaBuffer_7: array<vec4f, 1048576>;

      struct mainInitWorld_Input_8 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(1) fn mainInitWorld_0(input: mainInitWorld_Input_8) {
        var x = i32(input.gid.x);
        var y = i32(input.gid.y);
        var index = coordsToIndex_1(x, y);
        var value = vec4f();
        if (!isValidFlowOut_2(x, y)) {
          value = vec4f();
        }
        else {
          if ((y < 128)) {
            var depth = (1 - (f32(y) / 128f));
            value = vec4f(0, 0, (10 + (depth * 10)), 0);
          }
        }
        gridBetaBuffer_7[index] = value;
      }

      fn coordsToIndex_10(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<uniform> time_11: f32;

      var<private> seed_14: vec2f;

      fn seed2_13(value: vec2f) {
        seed_14 = value;
      }

      fn randSeed2_12(seed: vec2f) {
        seed2_13(seed);
      }

      @group(0) @binding(1) var<storage, read> gridBetaBuffer_16: array<vec4f, 1048576>;

      fn getCell_15(x: i32, y: i32) -> vec4f {
        return gridBetaBuffer_16[coordsToIndex_10(x, y)];
      }

      fn isValidCoord_19(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_22 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(2) var<storage, read> obstacles_21: array<BoxObstacle_22, 4>;

      fn isInsideObstacle_20(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_21[obsIdx];
          if ((obs.enabled == 0)) {
            continue;
          }
          var minX = max(0, (obs.center.x - i32((f32(obs.size.x) / 2f))));
          var maxX = min(256, (obs.center.x + i32((f32(obs.size.x) / 2f))));
          var minY = max(0, (obs.center.y - i32((f32(obs.size.y) / 2f))));
          var maxY = min(256, (obs.center.y + i32((f32(obs.size.y) / 2f))));
          if (((((x >= minX) && (x <= maxX)) && (y >= minY)) && (y <= maxY))) {
            return true;
          }
        }
        return false;
      }

      fn isValidFlowOut_18(x: i32, y: i32) -> bool {
        if (!isValidCoord_19(x, y)) {
          return false;
        }
        if (isInsideObstacle_20(x, y)) {
          return false;
        }
        return true;
      }

      fn item_24() -> f32 {
        var a = dot(seed_14, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_14, vec2f(54.47856521606445, 345.8415222167969));
        seed_14.x = fract((cos(a) * 136.8168));
        seed_14.y = fract((cos(b) * 534.7645));
        return seed_14.y;
      }

      fn randFloat01_23() -> f32 {
        return item_24();
      }

      fn computeVelocity_17(x: i32, y: i32) -> vec2f {
        var gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_15(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4); i++) {
          var offset = neighborOffsets[i];
          var neighborDensity = getCell_15((x + offset.x), (y + offset.y));
          var cost = (neighborDensity.z + (f32(offset.y) * gravityCost));
          if (!isValidFlowOut_18((x + offset.x), (y + offset.y))) {
            continue;
          }
          if ((cost == leastCost)) {
            dirChoices[dirChoiceCount] = vec2f(f32(offset.x), f32(offset.y));
            dirChoiceCount++;
          }
          else {
            if ((cost < leastCost)) {
              leastCost = cost;
              dirChoices[0] = vec2f(f32(offset.x), f32(offset.y));
              dirChoiceCount = 1;
            }
          }
        }
        var leastCostDir = dirChoices[u32((randFloat01_23() * f32(dirChoiceCount)))];
        return leastCostDir;
      }

      fn flowFromCell_25(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_19(x, y)) {
          return 0;
        }
        var src = getCell_15(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_15(destPos.x, destPos.y);
        var diff = (src.z - dest.z);
        var outFlow = min(max(0.01, (0.3 + (diff * 0.1))), src.z);
        if ((length(src.xy) < 0.5)) {
          outFlow = 0;
        }
        if (((myX == x) && (myY == y))) {
          return (src.z - outFlow);
        }
        if (((destPos.x == myX) && (destPos.y == myY))) {
          return outFlow;
        }
        return 0;
      }

      struct item_28 {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(3) var<uniform> sourceParams_27: item_28;

      fn getMinimumInFlow_26(x: i32, y: i32) -> f32 {
        var gridSizeF = 256f;
        var sourceRadius2 = max(1, (sourceParams_27.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_27.center.x * gridSizeF), (sourceParams_27.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_27.intensity;
        }
        return 0;
      }

      @group(0) @binding(4) var<storage, read_write> gridAlphaBuffer_29: array<vec4f, 1048576>;

      struct mainCompute_Input_30 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(8, 8) fn mainCompute_9(input: mainCompute_Input_30) {
        var x = i32(input.gid.x);
        var y = i32(input.gid.y);
        var index = coordsToIndex_10(x, y);
        randSeed2_12(vec2f(f32(index), time_11));
        var next = getCell_15(x, y);
        var nextVelocity = computeVelocity_17(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_25(x, y, x, y);
        next.z += flowFromCell_25(x, y, x, (y + 1));
        next.z += flowFromCell_25(x, y, x, (y - 1));
        next.z += flowFromCell_25(x, y, (x + 1), y);
        next.z += flowFromCell_25(x, y, (x - 1), y);
        var minInflow = getMinimumInFlow_26(x, y);
        next.z = max(minInflow, next.z);
        gridAlphaBuffer_29[index] = next;
      }

      fn coordsToIndex_32(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<uniform> time_33: f32;

      var<private> seed_36: vec2f;

      fn seed2_35(value: vec2f) {
        seed_36 = value;
      }

      fn randSeed2_34(seed: vec2f) {
        seed2_35(seed);
      }

      @group(0) @binding(1) var<storage, read> gridAlphaBuffer_38: array<vec4f, 1048576>;

      fn getCell_37(x: i32, y: i32) -> vec4f {
        return gridAlphaBuffer_38[coordsToIndex_32(x, y)];
      }

      fn isValidCoord_41(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_44 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(2) var<storage, read> obstacles_43: array<BoxObstacle_44, 4>;

      fn isInsideObstacle_42(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_43[obsIdx];
          if ((obs.enabled == 0)) {
            continue;
          }
          var minX = max(0, (obs.center.x - i32((f32(obs.size.x) / 2f))));
          var maxX = min(256, (obs.center.x + i32((f32(obs.size.x) / 2f))));
          var minY = max(0, (obs.center.y - i32((f32(obs.size.y) / 2f))));
          var maxY = min(256, (obs.center.y + i32((f32(obs.size.y) / 2f))));
          if (((((x >= minX) && (x <= maxX)) && (y >= minY)) && (y <= maxY))) {
            return true;
          }
        }
        return false;
      }

      fn isValidFlowOut_40(x: i32, y: i32) -> bool {
        if (!isValidCoord_41(x, y)) {
          return false;
        }
        if (isInsideObstacle_42(x, y)) {
          return false;
        }
        return true;
      }

      fn item_46() -> f32 {
        var a = dot(seed_36, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_36, vec2f(54.47856521606445, 345.8415222167969));
        seed_36.x = fract((cos(a) * 136.8168));
        seed_36.y = fract((cos(b) * 534.7645));
        return seed_36.y;
      }

      fn randFloat01_45() -> f32 {
        return item_46();
      }

      fn computeVelocity_39(x: i32, y: i32) -> vec2f {
        var gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_37(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4); i++) {
          var offset = neighborOffsets[i];
          var neighborDensity = getCell_37((x + offset.x), (y + offset.y));
          var cost = (neighborDensity.z + (f32(offset.y) * gravityCost));
          if (!isValidFlowOut_40((x + offset.x), (y + offset.y))) {
            continue;
          }
          if ((cost == leastCost)) {
            dirChoices[dirChoiceCount] = vec2f(f32(offset.x), f32(offset.y));
            dirChoiceCount++;
          }
          else {
            if ((cost < leastCost)) {
              leastCost = cost;
              dirChoices[0] = vec2f(f32(offset.x), f32(offset.y));
              dirChoiceCount = 1;
            }
          }
        }
        var leastCostDir = dirChoices[u32((randFloat01_45() * f32(dirChoiceCount)))];
        return leastCostDir;
      }

      fn flowFromCell_47(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_41(x, y)) {
          return 0;
        }
        var src = getCell_37(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_37(destPos.x, destPos.y);
        var diff = (src.z - dest.z);
        var outFlow = min(max(0.01, (0.3 + (diff * 0.1))), src.z);
        if ((length(src.xy) < 0.5)) {
          outFlow = 0;
        }
        if (((myX == x) && (myY == y))) {
          return (src.z - outFlow);
        }
        if (((destPos.x == myX) && (destPos.y == myY))) {
          return outFlow;
        }
        return 0;
      }

      struct item_50 {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(3) var<uniform> sourceParams_49: item_50;

      fn getMinimumInFlow_48(x: i32, y: i32) -> f32 {
        var gridSizeF = 256f;
        var sourceRadius2 = max(1, (sourceParams_49.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_49.center.x * gridSizeF), (sourceParams_49.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_49.intensity;
        }
        return 0;
      }

      @group(0) @binding(4) var<storage, read_write> gridBetaBuffer_51: array<vec4f, 1048576>;

      struct mainCompute_Input_52 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      @compute @workgroup_size(8, 8) fn mainCompute_31(input: mainCompute_Input_52) {
        var x = i32(input.gid.x);
        var y = i32(input.gid.y);
        var index = coordsToIndex_32(x, y);
        randSeed2_34(vec2f(f32(index), time_33));
        var next = getCell_37(x, y);
        var nextVelocity = computeVelocity_39(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_47(x, y, x, y);
        next.z += flowFromCell_47(x, y, x, (y + 1));
        next.z += flowFromCell_47(x, y, x, (y - 1));
        next.z += flowFromCell_47(x, y, (x + 1), y);
        next.z += flowFromCell_47(x, y, (x - 1), y);
        var minInflow = getMinimumInFlow_48(x, y);
        next.z = max(minInflow, next.z);
        gridBetaBuffer_51[index] = next;
      }

      struct vertexMain_Output_54 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexMain_Input_55 {
        @builtin(vertex_index) idx: u32,
      }

      @vertex fn vertexMain_53(input: vertexMain_Input_55) -> vertexMain_Output_54 {
        var pos = array<vec2f, 4>(vec2f(1), vec2f(-1, 1), vec2f(1, -1), vec2f(-1, -1));
        var uv = array<vec2f, 4>(vec2f(1), vec2f(0, 1), vec2f(1, 0), vec2f());
        return vertexMain_Output_54(vec4f(pos[input.idx].x, pos[input.idx].y, 0, 1), uv[input.idx]);
      }

      fn coordsToIndex_57(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<storage, read> gridAlphaBuffer_58: array<vec4f, 1048576>;

      struct BoxObstacle_61 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(1) var<storage, read> obstacles_60: array<BoxObstacle_61, 4>;

      fn isInsideObstacle_59(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_60[obsIdx];
          if ((obs.enabled == 0)) {
            continue;
          }
          var minX = max(0, (obs.center.x - i32((f32(obs.size.x) / 2f))));
          var maxX = min(256, (obs.center.x + i32((f32(obs.size.x) / 2f))));
          var minY = max(0, (obs.center.y - i32((f32(obs.size.y) / 2f))));
          var maxY = min(256, (obs.center.y + i32((f32(obs.size.y) / 2f))));
          if (((((x >= minX) && (x <= maxX)) && (y >= minY)) && (y <= maxY))) {
            return true;
          }
        }
        return false;
      }

      struct fragmentMain_Input_62 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain_56(input: fragmentMain_Input_62) -> @location(0) vec4f {
        var x = i32((input.uv.x * 256));
        var y = i32((input.uv.y * 256));
        var index = coordsToIndex_57(x, y);
        var cell = gridAlphaBuffer_58[index];
        var density = max(0, cell.z);
        var obstacleColor = vec4f(0.10000000149011612, 0.10000000149011612, 0.10000000149011612, 1);
        var background = vec4f(0.8999999761581421, 0.8999999761581421, 0.8999999761581421, 1);
        var firstColor = vec4f(0.20000000298023224, 0.6000000238418579, 1, 1);
        var secondColor = vec4f(0.20000000298023224, 0.30000001192092896, 0.6000000238418579, 1);
        var thirdColor = vec4f(0.10000000149011612, 0.20000000298023224, 0.4000000059604645, 1);
        var firstThreshold = 2f;
        var secondThreshold = 10f;
        var thirdThreshold = 20f;
        if (isInsideObstacle_59(x, y)) {
          return obstacleColor;
        }
        if ((density <= 0)) {
          return background;
        }
        if ((density <= firstThreshold)) {
          var t = (1 - pow((1 - (density / firstThreshold)), 2));
          return mix(background, firstColor, t);
        }
        if ((density <= secondThreshold)) {
          return mix(firstColor, secondColor, ((density - firstThreshold) / (secondThreshold - firstThreshold)));
        }
        return mix(secondColor, thirdColor, min(((density - secondThreshold) / thirdThreshold), 1));
      }"
    `);
  });
});
