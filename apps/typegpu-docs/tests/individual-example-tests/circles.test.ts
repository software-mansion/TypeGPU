/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { runExampleTest, setupCommonMocks } from './utils/baseTest.ts';
import { mockResizeObserver } from './utils/commonMocks.ts';

describe('circles example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'geometry',
        name: 'circles',
        setupMocks: mockResizeObserver,
        expectedCalls: 1,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "struct Circle {
        position: vec2f,
        radius: f32,
      }

      @group(0) @binding(0) var<storage, read> circles: array<Circle>;

      struct SubdivLevelResult {
        level: u32,
        pointCount: u32,
        vertexCountInLevel: u32,
        vertexIndexInLevel: u32,
      }

      fn getSubdivLevel(vertexIndex: u32) -> SubdivLevelResult {
        var totalVertexCount = 0u;
        for (var level = 0u; (level < 8u); level += 1u) {
          let pointCount = (3u * (1u << level));
          let triangleCount = select(1u, u32((3 * (1 << (level - 1u)))), (level > 0u));
          let vertexCountInLevel = (3u * triangleCount);
          let newVertexCount = (totalVertexCount + vertexCountInLevel);
          if ((vertexIndex < newVertexCount)) {
            return SubdivLevelResult(level, pointCount, vertexCountInLevel, (vertexIndex - totalVertexCount));
          }
          totalVertexCount = newVertexCount;
        }
        return SubdivLevelResult(0u, 0u, 0u, 0u);
      }

      fn consecutiveTriangleVertexIndex(i: u32) -> u32 {
        return u32((f32((2u * (i + 1u))) / 3f));
      }

      const PI: f32 = 3.141592653589793f;

      fn circle(vertexIndex: u32) -> vec2f {
        var subdiv = getSubdivLevel(vertexIndex);
        let i = consecutiveTriangleVertexIndex(subdiv.vertexIndexInLevel);
        let pointCount = subdiv.pointCount;
        let angle = (((2f * PI) * f32(i)) / f32(pointCount));
        return vec2f(cos(angle), sin(angle));
      }

      struct mainVertexMaxArea_Output {
        @builtin(position) outPos: vec4f,
        @location(0) uv: vec2f,
        @location(1) @interpolate(flat) instanceIndex: u32,
      }

      struct mainVertexMaxArea_Input {
        @builtin(instance_index) instanceIndex: u32,
        @builtin(vertex_index) vertexIndex: u32,
      }

      @vertex fn mainVertexMaxArea(_arg_0: mainVertexMaxArea_Input) -> mainVertexMaxArea_Output {
        let C = (&circles[_arg_0.instanceIndex]);
        var unit = circle(_arg_0.vertexIndex);
        var pos = ((*C).position + (unit * (*C).radius));
        return mainVertexMaxArea_Output(vec4f(pos, 0f, 1f), unit, _arg_0.instanceIndex);
      }

      struct mainFragment_Input {
        @location(0) uv: vec2f,
        @location(1) @interpolate(flat) instanceIndex: u32,
      }

      @fragment fn mainFragment(_arg_0: mainFragment_Input) -> @location(0) vec4f {
        var color = vec3f(1f, cos(f32(_arg_0.instanceIndex)), sin((5f * f32(_arg_0.instanceIndex))));
        let r = length(_arg_0.uv);
        return vec4f(mix(color, vec3f(), clamp(((r - 0.9f) * 20f), 0f, 0.5f)), 1f);
      }"
    `);
  });
});
