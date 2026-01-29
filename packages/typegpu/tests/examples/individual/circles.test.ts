/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('circles example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'geometry',
      name: 'circles',
      setupMocks: mockResizeObserver,
      expectedCalls: 1,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Circle_2 {
        position: vec2f,
        radius: f32,
      }

      @group(0) @binding(0) var<storage, read> circles_1: array<Circle_2>;

      struct SubdivLevelResult_5 {
        level: u32,
        pointCount: u32,
        vertexCountInLevel: u32,
        vertexIndexInLevel: u32,
      }

      fn getSubdivLevel_4(vertexIndex: u32) -> SubdivLevelResult_5 {
        var totalVertexCount = 0u;
        for (var level = 0u; (level < 8u); level += 1u) {
          let pointCount = (3u * (1u << level));
          let triangleCount = select(1u, (3u * (1u << (level - 1u))), (level > 0u));
          let vertexCountInLevel = (3u * triangleCount);
          let newVertexCount = (totalVertexCount + vertexCountInLevel);
          if ((vertexIndex < newVertexCount)) {
            return SubdivLevelResult_5(level, pointCount, vertexCountInLevel, (vertexIndex - totalVertexCount));
          }
          totalVertexCount = newVertexCount;
        }
        return SubdivLevelResult_5(0u, 0u, 0u, 0u);
      }

      fn consecutiveTriangleVertexIndex_6(i: u32) -> u32 {
        return u32((f32((2u * (i + 1u))) / 3f));
      }

      const PI_7: f32 = 3.141592653589793f;

      fn circle_3(vertexIndex: u32) -> vec2f {
        var subdiv = getSubdivLevel_4(vertexIndex);
        let i = consecutiveTriangleVertexIndex_6(subdiv.vertexIndexInLevel);
        let pointCount = subdiv.pointCount;
        let angle = (((2f * PI_7) * f32(i)) / f32(pointCount));
        return vec2f(cos(angle), sin(angle));
      }

      struct mainVertexMaxArea_Output_8 {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
        @location(1) @interpolate(flat) instanceIndex: u32,
      }

      struct mainVertexMaxArea_Input_9 {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertexMaxArea_0(_arg_0: mainVertexMaxArea_Input_9) -> mainVertexMaxArea_Output_8 {
        let C = (&circles_1[_arg_0.instanceIndex]);
        var unit = circle_3(_arg_0.vertexIndex);
        var pos = ((*C).position + (unit * (*C).radius));
        return mainVertexMaxArea_Output_8(vec4f(pos, 0f, 1f), unit, _arg_0.instanceIndex);
      }

      struct mainFragment_Input_11 {
        @location(0) uv: vec2f,
        @location(1) @interpolate(flat) instanceIndex: u32,
      }

      @fragment fn mainFragment_10(_arg_0: mainFragment_Input_11) -> @location(0) vec4f {
        var color = vec3f(1f, cos(f32(_arg_0.instanceIndex)), sin((5f * f32(_arg_0.instanceIndex))));
        let r = length(_arg_0.uv);
        return vec4f(mix(color, vec3f(), clamp(((r - 0.9f) * 20f), 0f, 0.5f)), 1f);
      }"
    `);
  });
});
