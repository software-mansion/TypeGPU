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
      waitForAsync: true,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct mainInitWorld_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      fn coordsToIndex_2(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      fn isValidCoord_4(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_7 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(0) var<storage, read> obstacles_6: array<BoxObstacle_7, 4>;

      fn isInsideObstacle_5(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_6[obsIdx];
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

      fn isValidFlowOut_3(x: i32, y: i32) -> bool {
        if (!isValidCoord_4(x, y)) {
          return false;
        }
        if (isInsideObstacle_5(x, y)) {
          return false;
        }
        return true;
      }

      @group(0) @binding(1) var<storage, read_write> gridBetaBuffer_8: array<vec4f, 1048576>;

      @compute @workgroup_size(1) fn mainInitWorld_0(input: mainInitWorld_Input_1) {
        var x = i32(input.gid.x);
        var y = i32(input.gid.y);
        var index = coordsToIndex_2(x, y);
        var value = vec4f();
        if (!isValidFlowOut_3(x, y)) {
          value = vec4f();
        }
        else {
          if ((y < i32(128))) {
            var depth = (1 - (f32(y) / 128f));
            value = vec4f(0, 0, (10 + (depth * 10)), 0);
          }
        }
        gridBetaBuffer_8[index] = value;
      }

      struct mainCompute_Input_10 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      fn coordsToIndex_11(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<uniform> time_12: f32;

      var<private> seed_15: vec2f;

      fn seed2_14(value: vec2f) {
        seed_15 = value;
      }

      fn randSeed2_13(seed: vec2f) {
        seed2_14(seed);
      }

      @group(0) @binding(1) var<storage, read> gridBetaBuffer_17: array<vec4f, 1048576>;

      fn getCell_16(x: i32, y: i32) -> vec4f {
        return gridBetaBuffer_17[coordsToIndex_11(x, y)];
      }

      fn isValidCoord_20(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_23 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(2) var<storage, read> obstacles_22: array<BoxObstacle_23, 4>;

      fn isInsideObstacle_21(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_22[obsIdx];
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

      fn isValidFlowOut_19(x: i32, y: i32) -> bool {
        if (!isValidCoord_20(x, y)) {
          return false;
        }
        if (isInsideObstacle_21(x, y)) {
          return false;
        }
        return true;
      }

      fn item_25() -> f32 {
        var a = dot(seed_15, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_15, vec2f(54.47856521606445, 345.8415222167969));
        seed_15.x = fract((cos(a) * 136.8168));
        seed_15.y = fract((cos(b) * 534.7645));
        return seed_15.y;
      }

      fn randFloat01_24() -> f32 {
        return item_25();
      }

      fn computeVelocity_18(x: i32, y: i32) -> vec2f {
        var gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_16(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4); i++) {
          var offset = neighborOffsets[i];
          var neighborDensity = getCell_16((x + offset.x), (y + offset.y));
          var cost = (neighborDensity.z + (f32(offset.y) * gravityCost));
          if (!isValidFlowOut_19((x + offset.x), (y + offset.y))) {
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
        var leastCostDir = dirChoices[u32((randFloat01_24() * f32(dirChoiceCount)))];
        return leastCostDir;
      }

      fn flowFromCell_26(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_20(x, y)) {
          return 0;
        }
        var src = getCell_16(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_16(destPos.x, destPos.y);
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

      struct item_29 {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(3) var<uniform> sourceParams_28: item_29;

      fn getMinimumInFlow_27(x: i32, y: i32) -> f32 {
        var gridSizeF = 256f;
        var sourceRadius2 = max(1, (sourceParams_28.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_28.center.x * gridSizeF), (sourceParams_28.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_28.intensity;
        }
        return 0;
      }

      @group(0) @binding(4) var<storage, read_write> gridAlphaBuffer_30: array<vec4f, 1048576>;

      @compute @workgroup_size(8, 8) fn mainCompute_9(input: mainCompute_Input_10) {
        var x = i32(input.gid.x);
        var y = i32(input.gid.y);
        var index = coordsToIndex_11(x, y);
        randSeed2_13(vec2f(f32(index), time_12));
        var next = getCell_16(x, y);
        var nextVelocity = computeVelocity_18(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_26(x, y, x, y);
        next.z += flowFromCell_26(x, y, x, (y + 1));
        next.z += flowFromCell_26(x, y, x, (y - 1));
        next.z += flowFromCell_26(x, y, (x + 1), y);
        next.z += flowFromCell_26(x, y, (x - 1), y);
        var minInflow = getMinimumInFlow_27(x, y);
        next.z = max(minInflow, next.z);
        gridAlphaBuffer_30[index] = next;
      }

      struct mainCompute_Input_32 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      fn coordsToIndex_33(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<uniform> time_34: f32;

      var<private> seed_37: vec2f;

      fn seed2_36(value: vec2f) {
        seed_37 = value;
      }

      fn randSeed2_35(seed: vec2f) {
        seed2_36(seed);
      }

      @group(0) @binding(1) var<storage, read> gridAlphaBuffer_39: array<vec4f, 1048576>;

      fn getCell_38(x: i32, y: i32) -> vec4f {
        return gridAlphaBuffer_39[coordsToIndex_33(x, y)];
      }

      fn isValidCoord_42(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_45 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(2) var<storage, read> obstacles_44: array<BoxObstacle_45, 4>;

      fn isInsideObstacle_43(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_44[obsIdx];
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

      fn isValidFlowOut_41(x: i32, y: i32) -> bool {
        if (!isValidCoord_42(x, y)) {
          return false;
        }
        if (isInsideObstacle_43(x, y)) {
          return false;
        }
        return true;
      }

      fn item_47() -> f32 {
        var a = dot(seed_37, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_37, vec2f(54.47856521606445, 345.8415222167969));
        seed_37.x = fract((cos(a) * 136.8168));
        seed_37.y = fract((cos(b) * 534.7645));
        return seed_37.y;
      }

      fn randFloat01_46() -> f32 {
        return item_47();
      }

      fn computeVelocity_40(x: i32, y: i32) -> vec2f {
        var gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_38(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4); i++) {
          var offset = neighborOffsets[i];
          var neighborDensity = getCell_38((x + offset.x), (y + offset.y));
          var cost = (neighborDensity.z + (f32(offset.y) * gravityCost));
          if (!isValidFlowOut_41((x + offset.x), (y + offset.y))) {
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
        var leastCostDir = dirChoices[u32((randFloat01_46() * f32(dirChoiceCount)))];
        return leastCostDir;
      }

      fn flowFromCell_48(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_42(x, y)) {
          return 0;
        }
        var src = getCell_38(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_38(destPos.x, destPos.y);
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

      struct item_51 {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(3) var<uniform> sourceParams_50: item_51;

      fn getMinimumInFlow_49(x: i32, y: i32) -> f32 {
        var gridSizeF = 256f;
        var sourceRadius2 = max(1, (sourceParams_50.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_50.center.x * gridSizeF), (sourceParams_50.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_50.intensity;
        }
        return 0;
      }

      @group(0) @binding(4) var<storage, read_write> gridBetaBuffer_52: array<vec4f, 1048576>;

      @compute @workgroup_size(8, 8) fn mainCompute_31(input: mainCompute_Input_32) {
        var x = i32(input.gid.x);
        var y = i32(input.gid.y);
        var index = coordsToIndex_33(x, y);
        randSeed2_35(vec2f(f32(index), time_34));
        var next = getCell_38(x, y);
        var nextVelocity = computeVelocity_40(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_48(x, y, x, y);
        next.z += flowFromCell_48(x, y, x, (y + 1));
        next.z += flowFromCell_48(x, y, x, (y - 1));
        next.z += flowFromCell_48(x, y, (x + 1), y);
        next.z += flowFromCell_48(x, y, (x - 1), y);
        var minInflow = getMinimumInFlow_49(x, y);
        next.z = max(minInflow, next.z);
        gridBetaBuffer_52[index] = next;
      }

      struct vertexMain_Input_54 {
        @builtin(vertex_index) idx: u32,
      }

      struct vertexMain_Output_55 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertexMain_53(input: vertexMain_Input_54) -> vertexMain_Output_55 {
        var pos = array<vec2f, 4>(vec2f(1), vec2f(-1, 1), vec2f(1, -1), vec2f(-1, -1));
        var uv = array<vec2f, 4>(vec2f(1), vec2f(0, 1), vec2f(1, 0), vec2f());
        return vertexMain_Output_55(vec4f(pos[input.idx].x, pos[input.idx].y, 0, 1), uv[input.idx]);
      }

      struct fragmentMain_Input_57 {
        @location(0) uv: vec2f,
      }

      fn coordsToIndex_58(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<storage, read> gridAlphaBuffer_59: array<vec4f, 1048576>;

      struct BoxObstacle_62 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(1) var<storage, read> obstacles_61: array<BoxObstacle_62, 4>;

      fn isInsideObstacle_60(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_61[obsIdx];
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

      @fragment fn fragmentMain_56(input: fragmentMain_Input_57) -> @location(0) vec4f {
        var x = i32((input.uv.x * 256));
        var y = i32((input.uv.y * 256));
        var index = coordsToIndex_58(x, y);
        var cell = gridAlphaBuffer_59[index];
        var density = max(0, cell.z);
        var obstacleColor = vec4f(0.10000000149011612, 0.10000000149011612, 0.10000000149011612, 1);
        var background = vec4f(0.8999999761581421, 0.8999999761581421, 0.8999999761581421, 1);
        var firstColor = vec4f(0.20000000298023224, 0.6000000238418579, 1, 1);
        var secondColor = vec4f(0.20000000298023224, 0.30000001192092896, 0.6000000238418579, 1);
        var thirdColor = vec4f(0.10000000149011612, 0.20000000298023224, 0.4000000059604645, 1);
        var firstThreshold = 2f;
        var secondThreshold = 10f;
        var thirdThreshold = 20f;
        if (isInsideObstacle_60(x, y)) {
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
