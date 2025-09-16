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
          if ((y < 128)) {
            var depth = (1 - (f32(y) / 128f));
            value = vec4f(0, 0, (10 + (depth * 10)), 0);
          }
        }
        gridBetaBuffer_8[index] = value;
      }

      struct mainCompute_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      fn coordsToIndex_2(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<uniform> time_3: f32;

      var<private> seed_6: vec2f;

      fn seed2_5(value: vec2f) {
        seed_6 = value;
      }

      fn randSeed2_4(seed: vec2f) {
        seed2_5(seed);
      }

      @group(0) @binding(1) var<storage, read> gridBetaBuffer_8: array<vec4f, 1048576>;

      fn getCell_7(x: i32, y: i32) -> vec4f {
        return gridBetaBuffer_8[coordsToIndex_2(x, y)];
      }

      fn isValidCoord_11(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_14 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(2) var<storage, read> obstacles_13: array<BoxObstacle_14, 4>;

      fn isInsideObstacle_12(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_13[obsIdx];
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

      fn isValidFlowOut_10(x: i32, y: i32) -> bool {
        if (!isValidCoord_11(x, y)) {
          return false;
        }
        if (isInsideObstacle_12(x, y)) {
          return false;
        }
        return true;
      }

      fn item_16() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randFloat01_15() -> f32 {
        return item_16();
      }

      fn computeVelocity_9(x: i32, y: i32) -> vec2f {
        var gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_7(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4); i++) {
          var offset = neighborOffsets[i];
          var neighborDensity = getCell_7((x + offset.x), (y + offset.y));
          var cost = (neighborDensity.z + (f32(offset.y) * gravityCost));
          if (!isValidFlowOut_10((x + offset.x), (y + offset.y))) {
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
        var leastCostDir = dirChoices[u32((randFloat01_15() * f32(dirChoiceCount)))];
        return leastCostDir;
      }

      fn flowFromCell_17(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_11(x, y)) {
          return 0;
        }
        var src = getCell_7(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_7(destPos.x, destPos.y);
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

      struct item_20 {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(3) var<uniform> sourceParams_19: item_20;

      fn getMinimumInFlow_18(x: i32, y: i32) -> f32 {
        var gridSizeF = 256f;
        var sourceRadius2 = max(1, (sourceParams_19.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_19.center.x * gridSizeF), (sourceParams_19.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_19.intensity;
        }
        return 0;
      }

      @group(0) @binding(4) var<storage, read_write> gridAlphaBuffer_21: array<vec4f, 1048576>;

      @compute @workgroup_size(8, 8) fn mainCompute_0(input: mainCompute_Input_1) {
        var x = i32(input.gid.x);
        var y = i32(input.gid.y);
        var index = coordsToIndex_2(x, y);
        randSeed2_4(vec2f(f32(index), time_3));
        var next = getCell_7(x, y);
        var nextVelocity = computeVelocity_9(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_17(x, y, x, y);
        next.z += flowFromCell_17(x, y, x, (y + 1));
        next.z += flowFromCell_17(x, y, x, (y - 1));
        next.z += flowFromCell_17(x, y, (x + 1), y);
        next.z += flowFromCell_17(x, y, (x - 1), y);
        var minInflow = getMinimumInFlow_18(x, y);
        next.z = max(minInflow, next.z);
        gridAlphaBuffer_21[index] = next;
      }

      struct mainCompute_Input_1 {
        @builtin(global_invocation_id) gid: vec3u,
      }

      fn coordsToIndex_2(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<uniform> time_3: f32;

      var<private> seed_6: vec2f;

      fn seed2_5(value: vec2f) {
        seed_6 = value;
      }

      fn randSeed2_4(seed: vec2f) {
        seed2_5(seed);
      }

      @group(0) @binding(1) var<storage, read> gridAlphaBuffer_8: array<vec4f, 1048576>;

      fn getCell_7(x: i32, y: i32) -> vec4f {
        return gridAlphaBuffer_8[coordsToIndex_2(x, y)];
      }

      fn isValidCoord_11(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_14 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(2) var<storage, read> obstacles_13: array<BoxObstacle_14, 4>;

      fn isInsideObstacle_12(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_13[obsIdx];
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

      fn isValidFlowOut_10(x: i32, y: i32) -> bool {
        if (!isValidCoord_11(x, y)) {
          return false;
        }
        if (isInsideObstacle_12(x, y)) {
          return false;
        }
        return true;
      }

      fn item_16() -> f32 {
        var a = dot(seed_6, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_6, vec2f(54.47856521606445, 345.8415222167969));
        seed_6.x = fract((cos(a) * 136.8168));
        seed_6.y = fract((cos(b) * 534.7645));
        return seed_6.y;
      }

      fn randFloat01_15() -> f32 {
        return item_16();
      }

      fn computeVelocity_9(x: i32, y: i32) -> vec2f {
        var gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_7(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4); i++) {
          var offset = neighborOffsets[i];
          var neighborDensity = getCell_7((x + offset.x), (y + offset.y));
          var cost = (neighborDensity.z + (f32(offset.y) * gravityCost));
          if (!isValidFlowOut_10((x + offset.x), (y + offset.y))) {
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
        var leastCostDir = dirChoices[u32((randFloat01_15() * f32(dirChoiceCount)))];
        return leastCostDir;
      }

      fn flowFromCell_17(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_11(x, y)) {
          return 0;
        }
        var src = getCell_7(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_7(destPos.x, destPos.y);
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

      struct item_20 {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(3) var<uniform> sourceParams_19: item_20;

      fn getMinimumInFlow_18(x: i32, y: i32) -> f32 {
        var gridSizeF = 256f;
        var sourceRadius2 = max(1, (sourceParams_19.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_19.center.x * gridSizeF), (sourceParams_19.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_19.intensity;
        }
        return 0;
      }

      @group(0) @binding(4) var<storage, read_write> gridBetaBuffer_21: array<vec4f, 1048576>;

      @compute @workgroup_size(8, 8) fn mainCompute_0(input: mainCompute_Input_1) {
        var x = i32(input.gid.x);
        var y = i32(input.gid.y);
        var index = coordsToIndex_2(x, y);
        randSeed2_4(vec2f(f32(index), time_3));
        var next = getCell_7(x, y);
        var nextVelocity = computeVelocity_9(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_17(x, y, x, y);
        next.z += flowFromCell_17(x, y, x, (y + 1));
        next.z += flowFromCell_17(x, y, x, (y - 1));
        next.z += flowFromCell_17(x, y, (x + 1), y);
        next.z += flowFromCell_17(x, y, (x - 1), y);
        var minInflow = getMinimumInFlow_18(x, y);
        next.z = max(minInflow, next.z);
        gridBetaBuffer_21[index] = next;
      }

      struct vertexMain_Input_1 {
        @builtin(vertex_index) idx: u32,
      }

      struct vertexMain_Output_2 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      @vertex fn vertexMain_0(input: vertexMain_Input_1) -> vertexMain_Output_2 {
        var pos = array<vec2f, 4>(vec2f(1), vec2f(-1, 1), vec2f(1, -1), vec2f(-1, -1));
        var uv = array<vec2f, 4>(vec2f(1), vec2f(0, 1), vec2f(1, 0), vec2f());
        return vertexMain_Output_2(vec4f(pos[input.idx].x, pos[input.idx].y, 0, 1), uv[input.idx]);
      }

      struct fragmentMain_Input_4 {
        @location(0) uv: vec2f,
      }

      fn coordsToIndex_5(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<storage, read> gridAlphaBuffer_6: array<vec4f, 1048576>;

      struct BoxObstacle_9 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(1) var<storage, read> obstacles_8: array<BoxObstacle_9, 4>;

      fn isInsideObstacle_7(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_8[obsIdx];
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

      @fragment fn fragmentMain_3(input: fragmentMain_Input_4) -> @location(0) vec4f {
        var x = i32((input.uv.x * 256));
        var y = i32((input.uv.y * 256));
        var index = coordsToIndex_5(x, y);
        var cell = gridAlphaBuffer_6[index];
        var density = max(0, cell.z);
        var obstacleColor = vec4f(0.10000000149011612, 0.10000000149011612, 0.10000000149011612, 1);
        var background = vec4f(0.8999999761581421, 0.8999999761581421, 0.8999999761581421, 1);
        var firstColor = vec4f(0.20000000298023224, 0.6000000238418579, 1, 1);
        var secondColor = vec4f(0.20000000298023224, 0.30000001192092896, 0.6000000238418579, 1);
        var thirdColor = vec4f(0.10000000149011612, 0.20000000298023224, 0.4000000059604645, 1);
        var firstThreshold = 2f;
        var secondThreshold = 10f;
        var thirdThreshold = 20f;
        if (isInsideObstacle_7(x, y)) {
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
