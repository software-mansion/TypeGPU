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
        return (x + (y * 256i));
      }

      fn isValidCoord_5(x: i32, y: i32) -> bool {
        return ((((x < 256i) && (x >= 0i)) && (y < 256i)) && (y >= 0i));
      }

      struct BoxObstacle_8 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(1) var<storage, read> obstacles_7: array<BoxObstacle_8, 4>;

      fn isInsideObstacle_6(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4i); obsIdx++) {
          let obs = (&obstacles_7[obsIdx]);
          if (((*obs).enabled == 0u)) {
            continue;
          }
          let minX = max(0i, ((*obs).center.x - i32((f32((*obs).size.x) / 2f))));
          let maxX = min(256i, ((*obs).center.x + i32((f32((*obs).size.x) / 2f))));
          let minY = max(0i, ((*obs).center.y - i32((f32((*obs).size.y) / 2f))));
          let maxY = min(256i, ((*obs).center.y + i32((f32((*obs).size.y) / 2f))));
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
        let x = i32(xu);
        let y = i32(yu);
        let index = coordsToIndex_3(x, y);
        var value = vec4f();
        if (!isValidFlowOut_4(x, y)) {
          value = vec4f();
        }
        else {
          if ((y < 128i)) {
            let depth = (1f - (f32(y) / 128f));
            value = vec4f(0f, 0f, (10f + (depth * 10f)), 0f);
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
        return (x + (y * 256i));
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
        return ((((x < 256i) && (x >= 0i)) && (y < 256i)) && (y >= 0i));
      }

      struct BoxObstacle_15 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(3) var<storage, read> obstacles_14: array<BoxObstacle_15, 4>;

      fn isInsideObstacle_13(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4i); obsIdx++) {
          let obs = (&obstacles_14[obsIdx]);
          if (((*obs).enabled == 0u)) {
            continue;
          }
          let minX = max(0i, ((*obs).center.x - i32((f32((*obs).size.x) / 2f))));
          let maxX = min(256i, ((*obs).center.x + i32((f32((*obs).size.x) / 2f))));
          let minY = max(0i, ((*obs).center.y - i32((f32((*obs).size.y) / 2f))));
          let maxY = min(256i, ((*obs).center.y + i32((f32((*obs).size.y) / 2f))));
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
        let a = dot(seed_7, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed_7, vec2f(54.47856521606445, 345.8415222167969));
        seed_7.x = fract((cos(a) * 136.8168f));
        seed_7.y = fract((cos(b) * 534.7645f));
        return seed_7.y;
      }

      fn randFloat01_16() -> f32 {
        return item_17();
      }

      fn computeVelocity_10(x: i32, y: i32) -> vec2f {
        const gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_8(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4i); i++) {
          let offset = (&neighborOffsets[i]);
          var neighborDensity = getCell_8((x + (*offset).x), (y + (*offset).y));
          let cost = (neighborDensity.z + (f32((*offset).y) * gravityCost));
          if (!isValidFlowOut_11((x + (*offset).x), (y + (*offset).y))) {
            continue;
          }
          if ((cost == leastCost)) {
            dirChoices[dirChoiceCount] = vec2f(f32((*offset).x), f32((*offset).y));
            dirChoiceCount++;
          }
          else {
            if ((cost < leastCost)) {
              leastCost = cost;
              dirChoices[0i] = vec2f(f32((*offset).x), f32((*offset).y));
              dirChoiceCount = 1i;
            }
          }
        }
        let leastCostDir = (&dirChoices[u32((randFloat01_16() * f32(dirChoiceCount)))]);
        return (*leastCostDir);
      }

      fn flowFromCell_18(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_12(x, y)) {
          return 0;
        }
        var src = getCell_8(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_8(destPos.x, destPos.y);
        let diff = (src.z - dest.z);
        var outFlow = min(max(0.01f, (0.3f + (diff * 0.1f))), src.z);
        if ((length(src.xy) < 0.5f)) {
          outFlow = 0f;
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
        const gridSizeF = 256f;
        let sourceRadius2 = max(1f, (sourceParams_20.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_20.center.x * gridSizeF), (sourceParams_20.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_20.intensity;
        }
        return 0;
      }

      @group(0) @binding(5) var<storage, read_write> gridAlphaBuffer_22: array<vec4f, 1048576>;

      fn simulate_2(xu: u32, yu: u32, _arg_2: u32) {
        let x = i32(xu);
        let y = i32(yu);
        let index = coordsToIndex_3(x, y);
        randSeed2_5(vec2f(f32(index), time_4));
        var next = getCell_8(x, y);
        var nextVelocity = computeVelocity_10(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_18(x, y, x, y);
        next.z += flowFromCell_18(x, y, x, (y + 1i));
        next.z += flowFromCell_18(x, y, x, (y - 1i));
        next.z += flowFromCell_18(x, y, (x + 1i), y);
        next.z += flowFromCell_18(x, y, (x - 1i), y);
        let minInflow = getMinimumInFlow_19(x, y);
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
        return (x + (y * 256i));
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
        return ((((x < 256i) && (x >= 0i)) && (y < 256i)) && (y >= 0i));
      }

      struct BoxObstacle_15 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(3) var<storage, read> obstacles_14: array<BoxObstacle_15, 4>;

      fn isInsideObstacle_13(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4i); obsIdx++) {
          let obs = (&obstacles_14[obsIdx]);
          if (((*obs).enabled == 0u)) {
            continue;
          }
          let minX = max(0i, ((*obs).center.x - i32((f32((*obs).size.x) / 2f))));
          let maxX = min(256i, ((*obs).center.x + i32((f32((*obs).size.x) / 2f))));
          let minY = max(0i, ((*obs).center.y - i32((f32((*obs).size.y) / 2f))));
          let maxY = min(256i, ((*obs).center.y + i32((f32((*obs).size.y) / 2f))));
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
        let a = dot(seed_7, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed_7, vec2f(54.47856521606445, 345.8415222167969));
        seed_7.x = fract((cos(a) * 136.8168f));
        seed_7.y = fract((cos(b) * 534.7645f));
        return seed_7.y;
      }

      fn randFloat01_16() -> f32 {
        return item_17();
      }

      fn computeVelocity_10(x: i32, y: i32) -> vec2f {
        const gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell_8(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        for (var i = 0; (i < 4i); i++) {
          let offset = (&neighborOffsets[i]);
          var neighborDensity = getCell_8((x + (*offset).x), (y + (*offset).y));
          let cost = (neighborDensity.z + (f32((*offset).y) * gravityCost));
          if (!isValidFlowOut_11((x + (*offset).x), (y + (*offset).y))) {
            continue;
          }
          if ((cost == leastCost)) {
            dirChoices[dirChoiceCount] = vec2f(f32((*offset).x), f32((*offset).y));
            dirChoiceCount++;
          }
          else {
            if ((cost < leastCost)) {
              leastCost = cost;
              dirChoices[0i] = vec2f(f32((*offset).x), f32((*offset).y));
              dirChoiceCount = 1i;
            }
          }
        }
        let leastCostDir = (&dirChoices[u32((randFloat01_16() * f32(dirChoiceCount)))]);
        return (*leastCostDir);
      }

      fn flowFromCell_18(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord_12(x, y)) {
          return 0;
        }
        var src = getCell_8(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell_8(destPos.x, destPos.y);
        let diff = (src.z - dest.z);
        var outFlow = min(max(0.01f, (0.3f + (diff * 0.1f))), src.z);
        if ((length(src.xy) < 0.5f)) {
          outFlow = 0f;
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
        const gridSizeF = 256f;
        let sourceRadius2 = max(1f, (sourceParams_20.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams_20.center.x * gridSizeF), (sourceParams_20.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams_20.intensity;
        }
        return 0;
      }

      @group(0) @binding(5) var<storage, read_write> gridBetaBuffer_22: array<vec4f, 1048576>;

      fn simulate_2(xu: u32, yu: u32, _arg_2: u32) {
        let x = i32(xu);
        let y = i32(yu);
        let index = coordsToIndex_3(x, y);
        randSeed2_5(vec2f(f32(index), time_4));
        var next = getCell_8(x, y);
        var nextVelocity = computeVelocity_10(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell_18(x, y, x, y);
        next.z += flowFromCell_18(x, y, x, (y + 1i));
        next.z += flowFromCell_18(x, y, x, (y - 1i));
        next.z += flowFromCell_18(x, y, (x + 1i), y);
        next.z += flowFromCell_18(x, y, (x - 1i), y);
        let minInflow = getMinimumInFlow_19(x, y);
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
        var pos = array<vec2f, 4>(vec2f(1), vec2f(-1, 1), vec2f(1, -1), vec2f(-1));
        var uv = array<vec2f, 4>(vec2f(1), vec2f(0, 1), vec2f(1, 0), vec2f());
        return vertexMain_Output_1(vec4f(pos[input.idx].x, pos[input.idx].y, 0f, 1f), uv[input.idx]);
      }

      fn coordsToIndex_4(x: i32, y: i32) -> i32 {
        return (x + (y * 256i));
      }

      @group(0) @binding(0) var<storage, read> gridAlphaBuffer_5: array<vec4f, 1048576>;

      struct BoxObstacle_8 {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(1) var<storage, read> obstacles_7: array<BoxObstacle_8, 4>;

      fn isInsideObstacle_6(x: i32, y: i32) -> bool {
        for (var obsIdx = 0; (obsIdx < 4i); obsIdx++) {
          let obs = (&obstacles_7[obsIdx]);
          if (((*obs).enabled == 0u)) {
            continue;
          }
          let minX = max(0i, ((*obs).center.x - i32((f32((*obs).size.x) / 2f))));
          let maxX = min(256i, ((*obs).center.x + i32((f32((*obs).size.x) / 2f))));
          let minY = max(0i, ((*obs).center.y - i32((f32((*obs).size.y) / 2f))));
          let maxY = min(256i, ((*obs).center.y + i32((f32((*obs).size.y) / 2f))));
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
        let x = i32((input.uv.x * 256f));
        let y = i32((input.uv.y * 256f));
        let index = coordsToIndex_4(x, y);
        let cell = (&gridAlphaBuffer_5[index]);
        let density = max(0f, (*cell).z);
        var obstacleColor = vec4f(0.10000000149011612, 0.10000000149011612, 0.10000000149011612, 1);
        var background = vec4f(0.8999999761581421, 0.8999999761581421, 0.8999999761581421, 1);
        var firstColor = vec4f(0.20000000298023224, 0.6000000238418579, 1, 1);
        var secondColor = vec4f(0.20000000298023224, 0.30000001192092896, 0.6000000238418579, 1);
        var thirdColor = vec4f(0.10000000149011612, 0.20000000298023224, 0.4000000059604645, 1);
        const firstThreshold = 2f;
        const secondThreshold = 10f;
        const thirdThreshold = 20f;
        if (isInsideObstacle_6(x, y)) {
          return obstacleColor;
        }
        if ((density <= 0f)) {
          return background;
        }
        if ((density <= firstThreshold)) {
          let t = (1f - pow((1f - (density / firstThreshold)), 2f));
          return mix(background, firstColor, t);
        }
        if ((density <= secondThreshold)) {
          return mix(firstColor, secondColor, ((density - firstThreshold) / (secondThreshold - firstThreshold)));
        }
        return mix(secondColor, thirdColor, min(((density - secondThreshold) / thirdThreshold), 1f));
      }"
    `);
  });
});
