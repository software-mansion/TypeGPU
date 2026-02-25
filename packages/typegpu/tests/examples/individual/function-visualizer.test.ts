/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('function visualizer example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest(
      {
        category: 'rendering',
        name: 'function-visualizer',
        setupMocks: mockResizeObserver,
        expectedCalls: 5,
      },
      device,
    );

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Properties {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(1) var<uniform> propertiesUniform: Properties;

      fn interpolatedFunction(x: f32) -> f32 {
        return x;
      }

      @group(1) @binding(0) var<storage, read_write> lineVertices: array<vec2f>;

      fn computePointsFn(x: u32, _arg_1: u32, _arg_2: u32) {
        let properties2 = (&propertiesUniform);
        let start = ((*properties2).transformation * vec4f(-1, 0, 0, 1)).x;
        let end = ((*properties2).transformation * vec4f(1, 0, 0, 1)).x;
        let pointX = (start + (((end - start) / (f32((*properties2).interpolationPoints) - 1f)) * f32(x)));
        let pointY = interpolatedFunction(pointX);
        var result = ((*properties2).inverseTransformation * vec4f(pointX, pointY, 0f, 1f));
        lineVertices[x] = result.xy;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        computePointsFn(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Properties {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(1) var<uniform> propertiesUniform: Properties;

      fn interpolatedFunction(x: f32) -> f32 {
        return cos(x*5)/3-x;
      }

      @group(1) @binding(0) var<storage, read_write> lineVertices: array<vec2f>;

      fn computePointsFn(x: u32, _arg_1: u32, _arg_2: u32) {
        let properties2 = (&propertiesUniform);
        let start = ((*properties2).transformation * vec4f(-1, 0, 0, 1)).x;
        let end = ((*properties2).transformation * vec4f(1, 0, 0, 1)).x;
        let pointX = (start + (((end - start) / (f32((*properties2).interpolationPoints) - 1f)) * f32(x)));
        let pointY = interpolatedFunction(pointX);
        var result = ((*properties2).inverseTransformation * vec4f(pointX, pointY, 0f, 1f));
        lineVertices[x] = result.xy;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        computePointsFn(in.id.x, in.id.y, in.id.z);
      }

      @group(0) @binding(0) var<uniform> sizeUniform: vec3u;

      struct Properties {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(1) var<uniform> propertiesUniform: Properties;

      fn interpolatedFunction(x: f32) -> f32 {
        return x*sin(log(abs(x)));
      }

      @group(1) @binding(0) var<storage, read_write> lineVertices: array<vec2f>;

      fn computePointsFn(x: u32, _arg_1: u32, _arg_2: u32) {
        let properties2 = (&propertiesUniform);
        let start = ((*properties2).transformation * vec4f(-1, 0, 0, 1)).x;
        let end = ((*properties2).transformation * vec4f(1, 0, 0, 1)).x;
        let pointX = (start + (((end - start) / (f32((*properties2).interpolationPoints) - 1f)) * f32(x)));
        let pointY = interpolatedFunction(pointX);
        var result = ((*properties2).inverseTransformation * vec4f(pointX, pointY, 0f, 1f));
        lineVertices[x] = result.xy;
      }

      struct mainCompute_Input {
        @builtin(global_invocation_id) id: vec3u,
      }

      @compute @workgroup_size(256, 1, 1) fn mainCompute(in: mainCompute_Input)  {
        if (any(in.id >= sizeUniform)) {
          return;
        }
        computePointsFn(in.id.x, in.id.y, in.id.z);
      }

      struct Properties {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(0) var<uniform> propertiesUniform: Properties;

      struct backgroundVertex_Output {
        @builtin(position) pos: vec4f,
      }

      struct backgroundVertex_Input {
        @builtin(vertex_index) vid: u32,
        @builtin(instance_index) iid: u32,
      }

      @vertex fn backgroundVertex(_arg_0: backgroundVertex_Input) -> backgroundVertex_Output {
        let properties2 = (&propertiesUniform);
        var leftBot = ((*properties2).transformation * vec4f(-1, -1, 0, 1));
        var rightTop = ((*properties2).transformation * vec4f(1, 1, 0, 1));
        let canvasRatio = ((rightTop.x - leftBot.x) / (rightTop.y - leftBot.y));
        var transformedPoints = array<vec2f, 4>(vec2f(leftBot.x, 0f), vec2f(rightTop.x, 0f), vec2f(0f, leftBot.y), vec2f(0f, rightTop.y));
        var currentPoint = ((*properties2).inverseTransformation * vec4f(transformedPoints[u32((f32((2u * _arg_0.iid)) + (f32(_arg_0.vid) / 2f)))].xy, 0f, 1f));
        return backgroundVertex_Output(vec4f((currentPoint.x + (((f32(_arg_0.iid) * select(-1f, 1f, ((_arg_0.vid % 2u) == 0u))) * 5e-3f) / canvasRatio)), (currentPoint.y + ((f32((1u - _arg_0.iid)) * select(-1f, 1f, ((_arg_0.vid % 2u) == 0u))) * 5e-3f)), currentPoint.zw));
      }

      @fragment fn backgroundFragment() -> @location(0) vec4f {
        return vec4f(0.8999999761581421, 0.8999999761581421, 0.8999999761581421, 1);
      }

      struct Properties {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(0) var<uniform> propertiesUniform: Properties;

      @group(1) @binding(0) var<storage, read> lineVertices_1: array<vec2f>;

      fn orthonormalForLine(p1: vec2f, p2: vec2f) -> vec2f {
        var line = (p2 - p1);
        var ortho = vec2f(-(line.y), line.x);
        return normalize(ortho);
      }

      fn orthonormalForVertex(index: f32) -> vec2f {
        if (((index == 0f) || (index == 255f))) {
          return vec2f(0, 1);
        }
        let lineVertices = (&lineVertices_1);
        let previous = (&(*lineVertices)[u32((index - 1f))]);
        let current = (&(*lineVertices)[u32(index)]);
        let next = (&(*lineVertices)[u32((index + 1f))]);
        var n1 = orthonormalForLine((*previous), (*current));
        var n2 = orthonormalForLine((*current), (*next));
        var avg = ((n1 + n2) / 2f);
        return normalize(avg);
      }

      struct vertex_Output {
        @builtin(position) pos: vec4f,
      }

      struct vertex_Input {
        @builtin(vertex_index) vid: u32,
      }

      @vertex fn vertex(_arg_0: vertex_Input) -> vertex_Output {
        let properties2 = (&propertiesUniform);
        let lineVertices = (&lineVertices_1);
        let currentVertex = (f32(_arg_0.vid) / 2f);
        var orthonormal = orthonormalForVertex(currentVertex);
        var offset = ((orthonormal * (*properties2).lineWidth) * select(-1f, 1f, ((_arg_0.vid % 2u) == 0u)));
        var leftBot = ((*properties2).transformation * vec4f(-1, -1, 0, 1));
        var rightTop = ((*properties2).transformation * vec4f(1, 1, 0, 1));
        let canvasRatio = ((rightTop.x - leftBot.x) / (rightTop.y - leftBot.y));
        var adjustedOffset = vec2f((offset.x / canvasRatio), offset.y);
        return vertex_Output(vec4f(((*lineVertices)[u32(currentVertex)] + adjustedOffset), 0f, 1f));
      }

      @group(1) @binding(1) var<uniform> color: vec4f;

      @fragment fn fragment() -> @location(0) vec4f {
        return color;
      }"
    `);
  });
});
