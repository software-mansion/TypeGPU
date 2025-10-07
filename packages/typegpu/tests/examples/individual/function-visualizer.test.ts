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
    const shaderCodes = await runExampleTest({
      category: 'rendering',
      name: 'function-visualizer',
      setupMocks: mockResizeObserver,
      expectedCalls: 5,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> lineVertices_0: array<vec2f>;

      struct Properties_2 {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(1) var<uniform> properties_1: Properties_2;
      fn interpolatedFunction(x: f32) -> f32 {
        return x;
      }
      @compute @workgroup_size(1) fn computePoints(@builtin(global_invocation_id) id: vec3u) {
        let start = (properties_1.transformation * vec4f(-1, 0, 0, 1)).x;
        let end = (properties_1.transformation * vec4f(1, 0, 0, 1)).x;

        let pointX = (start + (end-start)/(f32(properties_1.interpolationPoints)-1.0) * f32(id.x));
        let pointY = interpolatedFunction(pointX);
        let result = properties_1.inverseTransformation * vec4f(pointX, pointY, 0, 1);
        lineVertices_0[id.x] = result.xy;
      }
        

      @group(0) @binding(0) var<storage, read_write> lineVertices_0: array<vec2f>;

      struct Properties_2 {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(1) var<uniform> properties_1: Properties_2;
      fn interpolatedFunction(x: f32) -> f32 {
        return cos(x*5)/3-x;
      }
      @compute @workgroup_size(1) fn computePoints(@builtin(global_invocation_id) id: vec3u) {
        let start = (properties_1.transformation * vec4f(-1, 0, 0, 1)).x;
        let end = (properties_1.transformation * vec4f(1, 0, 0, 1)).x;

        let pointX = (start + (end-start)/(f32(properties_1.interpolationPoints)-1.0) * f32(id.x));
        let pointY = interpolatedFunction(pointX);
        let result = properties_1.inverseTransformation * vec4f(pointX, pointY, 0, 1);
        lineVertices_0[id.x] = result.xy;
      }
        

      @group(0) @binding(0) var<storage, read_write> lineVertices_0: array<vec2f>;

      struct Properties_2 {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(1) var<uniform> properties_1: Properties_2;
      fn interpolatedFunction(x: f32) -> f32 {
        return x*sin(log(abs(x)));
      }
      @compute @workgroup_size(1) fn computePoints(@builtin(global_invocation_id) id: vec3u) {
        let start = (properties_1.transformation * vec4f(-1, 0, 0, 1)).x;
        let end = (properties_1.transformation * vec4f(1, 0, 0, 1)).x;

        let pointX = (start + (end-start)/(f32(properties_1.interpolationPoints)-1.0) * f32(id.x));
        let pointY = interpolatedFunction(pointX);
        let result = properties_1.inverseTransformation * vec4f(pointX, pointY, 0, 1);
        lineVertices_0[id.x] = result.xy;
      }
        

      struct Properties_1 {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(0) var<uniform> properties_0: Properties_1;
      @vertex fn vs(
        @builtin(vertex_index) vertexIndex : u32,
        @builtin(instance_index) instanceIndex : u32,
      ) -> @builtin(position) vec4f {
        let leftBot = properties_0.transformation * vec4f(-1, -1, 0, 1);
        let rightTop = properties_0.transformation * vec4f(1, 1, 0, 1);
        let canvasRatio = (rightTop.x - leftBot.x) / (rightTop.y - leftBot.y);

        let transformedPoints = array(
          vec2f(leftBot.x, 0.0),
          vec2f(rightTop.x, 0.0),
          vec2f(0.0, leftBot.y),
          vec2f(0.0, rightTop.y),
        );

        let currentPoint = properties_0.inverseTransformation * vec4f(transformedPoints[2 * instanceIndex + vertexIndex/2].xy, 0, 1);
        return vec4f(
          currentPoint.x + f32(instanceIndex) * select(-1.0, 1.0, vertexIndex%2 == 0) * 0.005 / canvasRatio,
          currentPoint.y + f32(1-instanceIndex) * select(-1.0, 1.0, vertexIndex%2 == 0) * 0.005,
          currentPoint.zw
        );
      }

      @fragment fn fs() -> @location(0) vec4f {
        return vec4f(0.9, 0.9, 0.9, 1.0);
      }


      @group(0) @binding(0) var<storage, read> lineVertices_0: array<vec2f>;

      struct Properties_2 {
        transformation: mat4x4f,
        inverseTransformation: mat4x4f,
        interpolationPoints: u32,
        lineWidth: f32,
      }

      @group(0) @binding(1) var<uniform> properties_1: Properties_2;

      @group(0) @binding(2) var<uniform> color_3: vec4f;
      fn orthonormalForLine(p1: vec2f, p2: vec2f) -> vec2f {
        let line = p2 - p1;
        let ortho = vec2f(-line.y, line.x);
        return normalize(ortho);
      }

      fn orthonormalForVertex(index: u32) -> vec2f {
        if (index == 0 || index == properties_1.interpolationPoints-1) {
          return vec2f(0.0, 1.0);
        }
        let previous = lineVertices_0[index-1];
        let current = lineVertices_0[index];
        let next = lineVertices_0[index+1];

        let n1 = orthonormalForLine(previous, current);
        let n2 = orthonormalForLine(current, next);

        let avg = (n1+n2)/2.0;

        return normalize(avg);
      }

      @vertex fn vs(@builtin(vertex_index) vertexIndex : u32) -> @builtin(position) vec4f {
        let currentVertex = vertexIndex/2;
        let orthonormal = orthonormalForVertex(currentVertex);
        let offset = orthonormal * properties_1.lineWidth * select(-1.0, 1.0, vertexIndex%2 == 0);

        let leftBot = properties_1.transformation * vec4f(-1, -1, 0, 1);
        let rightTop = properties_1.transformation * vec4f(1, 1, 0, 1);
        let canvasRatio = (rightTop.x - leftBot.x) / (rightTop.y - leftBot.y);
        let adjustedOffset = vec2f(offset.x / canvasRatio, offset.y);

        return vec4f(lineVertices_0[currentVertex] + adjustedOffset, 0.0, 1.0);
      }

      @fragment fn fs() -> @location(0) vec4f {
        return color_3;
      }
      "
    `);
  });
});
