/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';

describe('fluid double buffering example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'simulation',
        name: 'fluid-double-buffering',
        expectedCalls: 4,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      fn coordsToIndex(x: i32, y: i32) -> i32 {
        return (x + (y * 256i));
      }

      fn isValidCoord(x: i32, y: i32) -> bool {
        return ((((x < 256i) && (x >= 0i)) && (y < 256i)) && (y >= 0i));
      }

      struct BoxObstacle {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(1) var<storage, read> obstacles: array<BoxObstacle, 4>;

      fn isInsideObstacle(x: i32, y: i32) -> bool {
        for (var i = 0u; i < 4u; i++) {
          let obs = (&obstacles[i]);
          {
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
        }
        return false;
      }

      fn isValidFlowOut(x: i32, y: i32) -> bool {
        if (!isValidCoord(x, y)) {
          return false;
        }
        if (isInsideObstacle(x, y)) {
          return false;
        }
        return true;
      }

      @group(0) @binding(2) var<storage, read_write> gridBetaBuffer: array<vec4f, 1048576>;

      fn wrappedCallback(xu: u32, yu: u32, _arg_2: u32) {
        let x = i32(xu);
        let y = i32(yu);
        let index = coordsToIndex(x, y);
        var value = vec4f();
        if (!isValidFlowOut(x, y)) {
          value = vec4f();
        }
        else {
          if ((y < 128i)) {
            let depth = (1f - (f32(y) / 128f));
            value = vec4f(0f, 0f, (10f + (depth * 10f)), 0f);
          }
        }
        gridBetaBuffer[index] = value;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        wrappedCallback(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      fn coordsToIndex(x: i32, y: i32) -> i32 {
        return (x + (y * 256i));
      }

      @group(0) @binding(1) var<uniform> time: f32;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      @group(0) @binding(2) var<storage, read> gridBetaBuffer: array<vec4f, 1048576>;

      fn getCell(x: i32, y: i32) -> vec4f {
        return gridBetaBuffer[coordsToIndex(x, y)];
      }

      fn isValidCoord(x: i32, y: i32) -> bool {
        return ((((x < 256i) && (x >= 0i)) && (y < 256i)) && (y >= 0i));
      }

      struct BoxObstacle {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(3) var<storage, read> obstacles: array<BoxObstacle, 4>;

      fn isInsideObstacle(x: i32, y: i32) -> bool {
        for (var i = 0u; i < 4u; i++) {
          let obs = (&obstacles[i]);
          {
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
        }
        return false;
      }

      fn isValidFlowOut(x: i32, y: i32) -> bool {
        if (!isValidCoord(x, y)) {
          return false;
        }
        if (isInsideObstacle(x, y)) {
          return false;
        }
        return true;
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      fn computeVelocity(x: i32, y: i32) -> vec2f {
        const gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        // unrolled iteration #0
        {
          var neighborDensity = getCell((x + neighborOffsets[0u].x), (y + neighborOffsets[0u].y));
          let cost = (neighborDensity.z + (f32(neighborOffsets[0u].y) * gravityCost));
          if (isValidFlowOut((x + neighborOffsets[0u].x), (y + neighborOffsets[0u].y))) {
            if ((cost == leastCost)) {
              dirChoices[dirChoiceCount] = vec2f(f32(neighborOffsets[0u].x), f32(neighborOffsets[0u].y));
              dirChoiceCount++;
            }
            else {
              if ((cost < leastCost)) {
                leastCost = cost;
                dirChoices[0i] = vec2f(f32(neighborOffsets[0u].x), f32(neighborOffsets[0u].y));
                dirChoiceCount = 1i;
              }
            }
          }
        }
        // unrolled iteration #1
        {
          var neighborDensity = getCell((x + neighborOffsets[1u].x), (y + neighborOffsets[1u].y));
          let cost = (neighborDensity.z + (f32(neighborOffsets[1u].y) * gravityCost));
          if (isValidFlowOut((x + neighborOffsets[1u].x), (y + neighborOffsets[1u].y))) {
            if ((cost == leastCost)) {
              dirChoices[dirChoiceCount] = vec2f(f32(neighborOffsets[1u].x), f32(neighborOffsets[1u].y));
              dirChoiceCount++;
            }
            else {
              if ((cost < leastCost)) {
                leastCost = cost;
                dirChoices[0i] = vec2f(f32(neighborOffsets[1u].x), f32(neighborOffsets[1u].y));
                dirChoiceCount = 1i;
              }
            }
          }
        }
        // unrolled iteration #2
        {
          var neighborDensity = getCell((x + neighborOffsets[2u].x), (y + neighborOffsets[2u].y));
          let cost = (neighborDensity.z + (f32(neighborOffsets[2u].y) * gravityCost));
          if (isValidFlowOut((x + neighborOffsets[2u].x), (y + neighborOffsets[2u].y))) {
            if ((cost == leastCost)) {
              dirChoices[dirChoiceCount] = vec2f(f32(neighborOffsets[2u].x), f32(neighborOffsets[2u].y));
              dirChoiceCount++;
            }
            else {
              if ((cost < leastCost)) {
                leastCost = cost;
                dirChoices[0i] = vec2f(f32(neighborOffsets[2u].x), f32(neighborOffsets[2u].y));
                dirChoiceCount = 1i;
              }
            }
          }
        }
        // unrolled iteration #3
        {
          var neighborDensity = getCell((x + neighborOffsets[3u].x), (y + neighborOffsets[3u].y));
          let cost = (neighborDensity.z + (f32(neighborOffsets[3u].y) * gravityCost));
          if (isValidFlowOut((x + neighborOffsets[3u].x), (y + neighborOffsets[3u].y))) {
            if ((cost == leastCost)) {
              dirChoices[dirChoiceCount] = vec2f(f32(neighborOffsets[3u].x), f32(neighborOffsets[3u].y));
              dirChoiceCount++;
            }
            else {
              if ((cost < leastCost)) {
                leastCost = cost;
                dirChoices[0i] = vec2f(f32(neighborOffsets[3u].x), f32(neighborOffsets[3u].y));
                dirChoiceCount = 1i;
              }
            }
          }
        }
        let leastCostDir = (&dirChoices[u32((randFloat01() * f32(dirChoiceCount)))]);
        return (*leastCostDir);
      }

      fn flowFromCell(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord(x, y)) {
          return 0;
        }
        var src = getCell(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell(destPos.x, destPos.y);
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

      struct item {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(4) var<uniform> sourceParams: item;

      fn getMinimumInFlow(x: i32, y: i32) -> f32 {
        const gridSizeF = 256f;
        let sourceRadius2 = max(1f, (sourceParams.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams.center.x * gridSizeF), (sourceParams.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams.intensity;
        }
        return 0;
      }

      @group(0) @binding(5) var<storage, read_write> gridAlphaBuffer: array<vec4f, 1048576>;

      fn simulate(xu: u32, yu: u32, _arg_2: u32) {
        let x = i32(xu);
        let y = i32(yu);
        let index = coordsToIndex(x, y);
        randSeed2(vec2f(f32(index), time));
        var next = getCell(x, y);
        var nextVelocity = computeVelocity(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell(x, y, x, y);
        next.z += flowFromCell(x, y, x, (y + 1i));
        next.z += flowFromCell(x, y, x, (y - 1i));
        next.z += flowFromCell(x, y, (x + 1i), y);
        next.z += flowFromCell(x, y, (x - 1i), y);
        let minInflow = getMinimumInFlow(x, y);
        next.z = max(minInflow, next.z);
        gridAlphaBuffer[index] = next;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        simulate(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      fn coordsToIndex(x: i32, y: i32) -> i32 {
        return (x + (y * 256i));
      }

      @group(0) @binding(1) var<uniform> time: f32;

      var<private> seed: vec2f;

      fn seed2(value: vec2f) {
        seed = value;
      }

      fn randSeed2(seed: vec2f) {
        seed2(seed);
      }

      @group(0) @binding(2) var<storage, read> gridAlphaBuffer: array<vec4f, 1048576>;

      fn getCell(x: i32, y: i32) -> vec4f {
        return gridAlphaBuffer[coordsToIndex(x, y)];
      }

      fn isValidCoord(x: i32, y: i32) -> bool {
        return ((((x < 256i) && (x >= 0i)) && (y < 256i)) && (y >= 0i));
      }

      struct BoxObstacle {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(3) var<storage, read> obstacles: array<BoxObstacle, 4>;

      fn isInsideObstacle(x: i32, y: i32) -> bool {
        for (var i = 0u; i < 4u; i++) {
          let obs = (&obstacles[i]);
          {
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
        }
        return false;
      }

      fn isValidFlowOut(x: i32, y: i32) -> bool {
        if (!isValidCoord(x, y)) {
          return false;
        }
        if (isInsideObstacle(x, y)) {
          return false;
        }
        return true;
      }

      fn sample() -> f32 {
        let a = dot(seed, vec2f(23.140779495239258, 232.6168975830078));
        let b = dot(seed, vec2f(54.47856521606445, 345.8415222167969));
        seed.x = fract((cos(a) * 136.8168f));
        seed.y = fract((cos(b) * 534.7645f));
        return seed.y;
      }

      fn randFloat01() -> f32 {
        return sample();
      }

      fn computeVelocity(x: i32, y: i32) -> vec2f {
        const gravityCost = 0.5;
        var neighborOffsets = array<vec2i, 4>(vec2i(0, 1), vec2i(0, -1), vec2i(1, 0), vec2i(-1, 0));
        var cell = getCell(x, y);
        var leastCost = cell.z;
        var dirChoices = array<vec2f, 4>(vec2f(), vec2f(), vec2f(), vec2f());
        var dirChoiceCount = 1;
        // unrolled iteration #0
        {
          var neighborDensity = getCell((x + neighborOffsets[0u].x), (y + neighborOffsets[0u].y));
          let cost = (neighborDensity.z + (f32(neighborOffsets[0u].y) * gravityCost));
          if (isValidFlowOut((x + neighborOffsets[0u].x), (y + neighborOffsets[0u].y))) {
            if ((cost == leastCost)) {
              dirChoices[dirChoiceCount] = vec2f(f32(neighborOffsets[0u].x), f32(neighborOffsets[0u].y));
              dirChoiceCount++;
            }
            else {
              if ((cost < leastCost)) {
                leastCost = cost;
                dirChoices[0i] = vec2f(f32(neighborOffsets[0u].x), f32(neighborOffsets[0u].y));
                dirChoiceCount = 1i;
              }
            }
          }
        }
        // unrolled iteration #1
        {
          var neighborDensity = getCell((x + neighborOffsets[1u].x), (y + neighborOffsets[1u].y));
          let cost = (neighborDensity.z + (f32(neighborOffsets[1u].y) * gravityCost));
          if (isValidFlowOut((x + neighborOffsets[1u].x), (y + neighborOffsets[1u].y))) {
            if ((cost == leastCost)) {
              dirChoices[dirChoiceCount] = vec2f(f32(neighborOffsets[1u].x), f32(neighborOffsets[1u].y));
              dirChoiceCount++;
            }
            else {
              if ((cost < leastCost)) {
                leastCost = cost;
                dirChoices[0i] = vec2f(f32(neighborOffsets[1u].x), f32(neighborOffsets[1u].y));
                dirChoiceCount = 1i;
              }
            }
          }
        }
        // unrolled iteration #2
        {
          var neighborDensity = getCell((x + neighborOffsets[2u].x), (y + neighborOffsets[2u].y));
          let cost = (neighborDensity.z + (f32(neighborOffsets[2u].y) * gravityCost));
          if (isValidFlowOut((x + neighborOffsets[2u].x), (y + neighborOffsets[2u].y))) {
            if ((cost == leastCost)) {
              dirChoices[dirChoiceCount] = vec2f(f32(neighborOffsets[2u].x), f32(neighborOffsets[2u].y));
              dirChoiceCount++;
            }
            else {
              if ((cost < leastCost)) {
                leastCost = cost;
                dirChoices[0i] = vec2f(f32(neighborOffsets[2u].x), f32(neighborOffsets[2u].y));
                dirChoiceCount = 1i;
              }
            }
          }
        }
        // unrolled iteration #3
        {
          var neighborDensity = getCell((x + neighborOffsets[3u].x), (y + neighborOffsets[3u].y));
          let cost = (neighborDensity.z + (f32(neighborOffsets[3u].y) * gravityCost));
          if (isValidFlowOut((x + neighborOffsets[3u].x), (y + neighborOffsets[3u].y))) {
            if ((cost == leastCost)) {
              dirChoices[dirChoiceCount] = vec2f(f32(neighborOffsets[3u].x), f32(neighborOffsets[3u].y));
              dirChoiceCount++;
            }
            else {
              if ((cost < leastCost)) {
                leastCost = cost;
                dirChoices[0i] = vec2f(f32(neighborOffsets[3u].x), f32(neighborOffsets[3u].y));
                dirChoiceCount = 1i;
              }
            }
          }
        }
        let leastCostDir = (&dirChoices[u32((randFloat01() * f32(dirChoiceCount)))]);
        return (*leastCostDir);
      }

      fn flowFromCell(myX: i32, myY: i32, x: i32, y: i32) -> f32 {
        if (!isValidCoord(x, y)) {
          return 0;
        }
        var src = getCell(x, y);
        var destPos = vec2i((x + i32(src.x)), (y + i32(src.y)));
        var dest = getCell(destPos.x, destPos.y);
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

      struct item {
        center: vec2f,
        radius: f32,
        intensity: f32,
      }

      @group(0) @binding(4) var<uniform> sourceParams: item;

      fn getMinimumInFlow(x: i32, y: i32) -> f32 {
        const gridSizeF = 256f;
        let sourceRadius2 = max(1f, (sourceParams.radius * gridSizeF));
        var sourcePos = vec2f((sourceParams.center.x * gridSizeF), (sourceParams.center.y * gridSizeF));
        if ((distance(vec2f(f32(x), f32(y)), sourcePos) < sourceRadius2)) {
          return sourceParams.intensity;
        }
        return 0;
      }

      @group(0) @binding(5) var<storage, read_write> gridBetaBuffer: array<vec4f, 1048576>;

      fn simulate(xu: u32, yu: u32, _arg_2: u32) {
        let x = i32(xu);
        let y = i32(yu);
        let index = coordsToIndex(x, y);
        randSeed2(vec2f(f32(index), time));
        var next = getCell(x, y);
        var nextVelocity = computeVelocity(x, y);
        next.x = nextVelocity.x;
        next.y = nextVelocity.y;
        next.z = flowFromCell(x, y, x, y);
        next.z += flowFromCell(x, y, x, (y + 1i));
        next.z += flowFromCell(x, y, x, (y - 1i));
        next.z += flowFromCell(x, y, (x + 1i), y);
        next.z += flowFromCell(x, y, (x - 1i), y);
        let minInflow = getMinimumInFlow(x, y);
        next.z = max(minInflow, next.z);
        gridBetaBuffer[index] = next;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(16, 16, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        simulate(in.id.x, in.id.y, in.id.z);
      }

      struct vertexMain_Output {
        @builtin(position) pos: vec4f,
        @location(0) uv: vec2f,
      }

      struct vertexMain_Input {
        @builtin(vertex_index) idx: u32,
      }

      @vertex fn vertexMain(input: vertexMain_Input) -> vertexMain_Output {
        var pos = array<vec2f, 4>(vec2f(1), vec2f(-1, 1), vec2f(1, -1), vec2f(-1));
        var uv = array<vec2f, 4>(vec2f(1), vec2f(0, 1), vec2f(1, 0), vec2f());
        return vertexMain_Output(vec4f(pos[input.idx].x, pos[input.idx].y, 0f, 1f), uv[input.idx]);
      }

      fn coordsToIndex(x: i32, y: i32) -> i32 {
        return (x + (y * 256i));
      }

      @group(0) @binding(0) var<storage, read> gridAlphaBuffer: array<vec4f, 1048576>;

      struct BoxObstacle {
        center: vec2i,
        size: vec2i,
        enabled: u32,
      }

      @group(0) @binding(1) var<storage, read> obstacles: array<BoxObstacle, 4>;

      fn isInsideObstacle(x: i32, y: i32) -> bool {
        for (var i = 0u; i < 4u; i++) {
          let obs = (&obstacles[i]);
          {
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
        }
        return false;
      }

      struct fragmentMain_Input {
        @location(0) uv: vec2f,
      }

      @fragment fn fragmentMain(input: fragmentMain_Input) -> @location(0) vec4f {
        let x = i32((input.uv.x * 256f));
        let y = i32((input.uv.y * 256f));
        let index = coordsToIndex(x, y);
        let cell = (&gridAlphaBuffer[index]);
        let density = max(0f, (*cell).z);
        var obstacleColor = vec4f(0.10000000149011612, 0.10000000149011612, 0.10000000149011612, 1);
        var background = vec4f(0.8999999761581421, 0.8999999761581421, 0.8999999761581421, 1);
        var firstColor = vec4f(0.20000000298023224, 0.6000000238418579, 1, 1);
        var secondColor = vec4f(0.20000000298023224, 0.30000001192092896, 0.6000000238418579, 1);
        var thirdColor = vec4f(0.10000000149011612, 0.20000000298023224, 0.4000000059604645, 1);
        const firstThreshold = 2f;
        const secondThreshold = 10f;
        const thirdThreshold = 20f;
        if (isInsideObstacle(x, y)) {
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
