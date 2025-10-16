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
      "@group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn coordsToIndex_3(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      fn isValidCoord_5(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_8 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(1) var<storage, read> obstacles_7: array<BoxObstacle_8, 4>;

      fn isInsideObstacle_6(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_7[obsIdx];
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

      fn isValidFlowOut_4(x: i32, y: i32) -> bool {
        if (!isValidCoord_5(x, y)) {
          return false;
        }
        if (isInsideObstacle_6(x, y)) {
          return false;
        }
        return true;
      }

      @group(0) @binding(2) var<storage, read_write> gridBetaBuffer_9: array<vec4f, 1048576>;

      fn wrappedCallback_2(xu: u32, yu: u32, _arg_2: u32) {
        var x = i32(xu);
        var y = i32(yu);
        var index = coordsToIndex_3(x, y);
        var value = vec4f();
        if (!isValidFlowOut_4(x, y)) {
          value = vec4f();
        }
        else {
          if ((y < 128)) {
            var depth = (1 - (f32(y) / 128f));
            value = vec4f(0, 0, (10 + (depth * 10)), 0);
          }
        }
        gridBetaBuffer_9[index] = value;
      }

      struct mainCompute_Input_10 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute_0(in: mainCompute_Input_10)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        wrappedCallback_2(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn coordsToIndex_3(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(1) var<uniform> time_4: f32;

      var<private> seed_7: vec2f;

      fn seed2_6(value: vec2f) {
        seed_7 = value;
      }

      fn randSeed2_5(seed: vec2f) {
        seed2_6(seed);
      }

      @group(0) @binding(2) var<storage, read> gridBetaBuffer_9: array<vec4f, 1048576>;

      fn getCell_8(x: i32, y: i32) -> vec4f {
        return gridBetaBuffer_9[coordsToIndex_3(x, y)];
      }

      fn isValidCoord_12(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_15 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(3) var<storage, read> obstacles_14: array<BoxObstacle_15, 4>;

      fn isInsideObstacle_13(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_14[obsIdx];
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

      fn isValidFlowOut_11(x: i32, y: i32) -> bool {
        if (!isValidCoord_12(x, y)) {
          return false;
        }
        if (isInsideObstacle_13(x, y)) {
          return false;
        }
        return true;
      }

      fn item_17() -> f32 {
        var a = dot(seed_7, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_7, vec2f(54.47856521606445, 345.8415222167969));
        seed_7.x = fract((cos(a) * 136.8168));
        seed_7.y = fract((cos(b) * 534.7645));
        return seed_7.y;
      }

      fn randFloat01_16() -> f32 {
        return item_17();
      }

      fn computeVelocity_10(x: i32, y: i32) -> vec2f {
        var gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_8(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4); i++) {
          var offset = neighborOffsets[i];
          var neighborDensity = getCell_8((x + offset.x), (y + offset.y));
          var cost = (neighborDensity.z + (f32(offset.y) * gravityCost));
          if (!isValidFlowOut_11((x + offset.x), (y + offset.y))) {
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
        var leastCostDir = dirChoices[u32((randFloat01_16() * f32(dirChoiceCount)))];
        return leastCostDir;
      }

      fn flowFromCell_18(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_12(x, y)) {
          return 0;
        }
        var src = getCell_8(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_8(destPos.x, destPos.y);
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

      struct item_21 {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(4) var<uniform> sourceParams_20: item_21;

      fn getMinimumInFlow_19(x: i32, y: i32) -> f32 {
        var gridSizeF = 256f;
        var sourceRadius2 = max(1, (sourceParams_20.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_20.center.x * gridSizeF), (sourceParams_20.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_20.intensity;
        }
        return 0;
      }

      @group(0) @binding(5) var<storage, read_write> gridAlphaBuffer_22: array<vec4f, 1048576>;

      fn simulate_2(xu: u32, yu: u32, _arg_2: u32) {
        var x = i32(xu);
        var y = i32(yu);
        var index = coordsToIndex_3(x, y);
        randSeed2_5(vec2f(f32(index), time_4));
        var next = getCell_8(x, y);
        var nextVelocity = computeVelocity_10(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_18(x, y, x, y);
        next.z += flowFromCell_18(x, y, x, (y + 1));
        next.z += flowFromCell_18(x, y, x, (y - 1));
        next.z += flowFromCell_18(x, y, (x + 1), y);
        next.z += flowFromCell_18(x, y, (x - 1), y);
        var minInflow = getMinimumInFlow_19(x, y);
        next.z = max(minInflow, next.z);
        gridAlphaBuffer_22[index] = next;
      }

      struct mainCompute_Input_23 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute_0(in: mainCompute_Input_23)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        simulate_2(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform_1: vec3u;

      fn coordsToIndex_3(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(1) var<uniform> time_4: f32;

      var<private> seed_7: vec2f;

      fn seed2_6(value: vec2f) {
        seed_7 = value;
      }

      fn randSeed2_5(seed: vec2f) {
        seed2_6(seed);
      }

      @group(0) @binding(2) var<storage, read> gridAlphaBuffer_9: array<vec4f, 1048576>;

      fn getCell_8(x: i32, y: i32) -> vec4f {
        return gridAlphaBuffer_9[coordsToIndex_3(x, y)];
      }

      fn isValidCoord_12(x: i32, y: i32) -> bool {
        return ((((x < 256) && (x >= 0)) && (y < 256)) && (y >= 0));
      }

      struct BoxObstacle_15 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(3) var<storage, read> obstacles_14: array<BoxObstacle_15, 4>;

      fn isInsideObstacle_13(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_14[obsIdx];
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

      fn isValidFlowOut_11(x: i32, y: i32) -> bool {
        if (!isValidCoord_12(x, y)) {
          return false;
        }
        if (isInsideObstacle_13(x, y)) {
          return false;
        }
        return true;
      }

      fn item_17() -> f32 {
        var a = dot(seed_7, vec2f(23.140779495239258, 232.6168975830078));
        var b = dot(seed_7, vec2f(54.47856521606445, 345.8415222167969));
        seed_7.x = fract((cos(a) * 136.8168));
        seed_7.y = fract((cos(b) * 534.7645));
        return seed_7.y;
      }

      fn randFloat01_16() -> f32 {
        return item_17();
      }

      fn computeVelocity_10(x: i32, y: i32) -> vec2f {
        var gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_8(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4); i++) {
          var offset = neighborOffsets[i];
          var neighborDensity = getCell_8((x + offset.x), (y + offset.y));
          var cost = (neighborDensity.z + (f32(offset.y) * gravityCost));
          if (!isValidFlowOut_11((x + offset.x), (y + offset.y))) {
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
        var leastCostDir = dirChoices[u32((randFloat01_16() * f32(dirChoiceCount)))];
        return leastCostDir;
      }

      fn flowFromCell_18(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_12(x, y)) {
          return 0;
        }
        var src = getCell_8(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_8(destPos.x, destPos.y);
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

      struct item_21 {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(4) var<uniform> sourceParams_20: item_21;

      fn getMinimumInFlow_19(x: i32, y: i32) -> f32 {
        var gridSizeF = 256f;
        var sourceRadius2 = max(1, (sourceParams_20.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_20.center.x * gridSizeF), (sourceParams_20.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_20.intensity;
        }
        return 0;
      }

      @group(0) @binding(5) var<storage, read_write> gridBetaBuffer_22: array<vec4f, 1048576>;

      fn simulate_2(xu: u32, yu: u32, _arg_2: u32) {
        var x = i32(xu);
        var y = i32(yu);
        var index = coordsToIndex_3(x, y);
        randSeed2_5(vec2f(f32(index), time_4));
        var next = getCell_8(x, y);
        var nextVelocity = computeVelocity_10(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_18(x, y, x, y);
        next.z += flowFromCell_18(x, y, x, (y + 1));
        next.z += flowFromCell_18(x, y, x, (y - 1));
        next.z += flowFromCell_18(x, y, (x + 1), y);
        next.z += flowFromCell_18(x, y, (x - 1), y);
        var minInflow = getMinimumInFlow_19(x, y);
        next.z = max(minInflow, next.z);
        gridBetaBuffer_22[index] = next;
      }

      struct mainCompute_Input_23 {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute_0(in: mainCompute_Input_23)  {
        if (any(in.id >= sizeUniform_1)) {
          return;
        }
        simulate_2(in.id.x, in.id.y, in.id.z);
      }

      struct vertexMain_Output_1 {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexMain_Input_2 {
        @builtin(vertex_index) idx: u32,
      }

      @vertex fn vertexMain_0(input: vertexMain_Input_2) -> vertexMain_Output_1 {
        var pos = array<vec2f, 4>(vec2f(1), vec2f(-1, 1), vec2f(1, -1), vec2f(-1, -1));
        var uv = array<vec2f, 4>(vec2f(1), vec2f(0, 1), vec2f(1, 0), vec2f());
        return vertexMain_Output_1(vec4f(pos[input.idx].x, pos[input.idx].y, 0, 1), uv[input.idx]);
      }

      fn coordsToIndex_4(x: i32, y: i32) -> i32 {
        return (x + (y * 256));
      }

      @group(0) @binding(0) var<storage, read> gridAlphaBuffer_5: array<vec4f, 1048576>;

      struct BoxObstacle_8 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(1) var<storage, read> obstacles_7: array<BoxObstacle_8, 4>;

      fn isInsideObstacle_6(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4); obsIdx++) {
          var obs = obstacles_7[obsIdx];
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

      struct fragmentMain_Input_9 {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain_3(input: fragmentMain_Input_9) -> @location(0) vec4f {
        var x = i32((input.uv.x * 256));
        var y = i32((input.uv.y * 256));
        var index = coordsToIndex_4(x, y);
        var cell = gridAlphaBuffer_5[index];
        var density = max(0, cell.z);
        var obstacleColor = vec4f(0.10000000149011612, 0.10000000149011612, 0.10000000149011612, 1);
        var background = vec4f(0.8999999761581421, 0.8999999761581421, 0.8999999761581421, 1);
        var firstColor = vec4f(0.20000000298023224, 0.6000000238418579, 1, 1);
        var secondColor = vec4f(0.20000000298023224, 0.30000001192092896, 0.6000000238418579, 1);
        var thirdColor = vec4f(0.10000000149011612, 0.20000000298023224, 0.4000000059604645, 1);
        var firstThreshold = 2f;
        var secondThreshold = 10f;
        var thirdThreshold = 20f;
        if (isInsideObstacle_6(x, y)) {
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
