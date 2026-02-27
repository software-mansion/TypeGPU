/**
 * @vitest-environment jsdom
 */

import { describe, expect } from 'vitest';
import { it } from '../../utils/extendedIt.ts';
import { runExampleTest, setupCommonMocks } from '../utils/baseTest.ts';
import { mockResizeObserver } from '../utils/commonMocks.ts';

describe('rotating-triangle-tiles example', () => {
  setupCommonMocks();

  it('should produce valid code', async ({ device }) => {
    const shaderCodes = await runExampleTest({
      category: 'simple',
      name: 'rotating-triangle-tiles',
      expectedCalls: 1,
      setupMocks: mockResizeObserver,
    }, device);

    expect(shaderCodes).toMatchInlineSnapshot(`
      "const originalVertices: array<vec2f, 3> = array<vec2f, 3>(vec2f(0.8660253882408142, -0.5), vec2f(0, 1), vec2f(-0.8660253882408142, -0.5));

      struct InstanceInfo {
        offset: vec2f,
        rotationAngle: f32,
      }

      @group(1) @binding(0) var<storage, read> instanceInfo: array<InstanceInfo>;

      @group(0) @binding(0) var<uniform> stepRotationUniform: f32;

      fn interpolate(inputValue: f32, inputLowerEndpoint: f32, inputUpperEndpoint: f32, outputLowerEndpoint: f32, outputUpperEndpoint: f32) -> f32 {
        let inputProgress = (inputValue - inputLowerEndpoint);
        let inputInterval = (inputUpperEndpoint - inputLowerEndpoint);
        let progressPercentage = (inputProgress / inputInterval);
        let outputInterval = (outputUpperEndpoint - outputLowerEndpoint);
        let outputValue = (outputLowerEndpoint + (outputInterval * progressPercentage));
        return outputValue;
      }

      fn interpolateBezier(inputValue: f32, outputLowerEndpoint: f32, outputUpperEndpoint: f32) -> f32 {
        return interpolate(inputValue, 0f, 1f, outputLowerEndpoint, outputUpperEndpoint);
      }

      @group(0) @binding(1) var<uniform> animationProgressUniform: f32;

      @group(0) @binding(2) var<uniform> middleSquareScaleUniform: f32;

      fn rotate(coordinate: vec2f, angleInDegrees: f32) -> vec2f {
        let angle = ((angleInDegrees * 3.141592653589793f) / 180f);
        let x = coordinate.x;
        let y = coordinate.y;
        return vec2f(((x * cos(angle)) - (y * sin(angle))), ((x * sin(angle)) + (y * cos(angle))));
      }

      fn getZeroOffset(scaleValue: f32, aspectRatioValue: f32) -> vec2f {
        let zeroXOffset = ((0.8660254037844386f * scaleValue) - (1f * aspectRatioValue));
        let zeroYOffset = (1f - scaleValue);
        return vec2f(zeroXOffset, zeroYOffset);
      }

      fn instanceTransform(position: vec2f, instanceInfo_1: InstanceInfo, scaleValue: f32, aspectRatioValue: f32) -> vec2f {
        var transformedPoint = (rotate((position * scaleValue), instanceInfo_1.rotationAngle) + (instanceInfo_1.offset + getZeroOffset(scaleValue, aspectRatioValue)));
        return (mat2x2f((1f / aspectRatioValue), 0f, 0f, 1f) * transformedPoint);
      }

      @group(0) @binding(3) var<uniform> scaleUniform: f32;

      @group(0) @binding(4) var<uniform> aspectRatioUniform: f32;

      struct midgroundVertex_Output {
        @builtin(position) outPos: vec4f,
        @location(0) @interpolate(flat) maskP0: vec2f,
        @location(1) @interpolate(flat) maskP1: vec2f,
        @location(2) @interpolate(flat) maskP2: vec2f,
        @location(3) vertexClipPos: vec2f,
      }

      struct midgroundVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
        @builtin(instance_index) instanceIndex: u32,
      }

      @vertex fn midgroundVertex(_arg_0: midgroundVertex_Input) -> midgroundVertex_Output {
        const SMALLEST_LOOPING_ROTATION_ANGLE = 120f;
        var vertexPosition = originalVertices[_arg_0.vertexIndex];
        let instanceInfo_1 = (&instanceInfo[_arg_0.instanceIndex]);
        let angle = interpolateBezier(animationProgressUniform, (stepRotationUniform % SMALLEST_LOOPING_ROTATION_ANGLE), (stepRotationUniform + (stepRotationUniform % SMALLEST_LOOPING_ROTATION_ANGLE)));
        let scaleFactor = interpolateBezier(animationProgressUniform, 0.5f, middleSquareScaleUniform);
        var calculatedPosition = (rotate(vertexPosition, angle) * scaleFactor);
        var finalPosition = instanceTransform(calculatedPosition, (*instanceInfo_1), scaleUniform, aspectRatioUniform);
        var maskP0 = instanceTransform(originalVertices[0i], (*instanceInfo_1), scaleUniform, aspectRatioUniform);
        var maskP1 = instanceTransform(originalVertices[1i], (*instanceInfo_1), scaleUniform, aspectRatioUniform);
        var maskP2 = instanceTransform(originalVertices[2i], (*instanceInfo_1), scaleUniform, aspectRatioUniform);
        return midgroundVertex_Output(vec4f(finalPosition, 0f, 1f), maskP0, maskP1, maskP2, finalPosition);
      }

      @group(0) @binding(5) var<uniform> drawOverNeighborsUniform: u32;

      fn edgeFunction(a: vec2f, b: vec2f, p: vec2f) -> f32 {
        return (((p.x - a.x) * (b.y - a.y)) - ((p.y - a.y) * (b.x - a.x)));
      }

      fn isOutsideMask(maskP0: vec2f, maskP1: vec2f, maskP2: vec2f, vertexClipPos: vec2f) -> bool {
        let e0 = edgeFunction(maskP0, maskP1, vertexClipPos);
        let e1 = edgeFunction(maskP1, maskP2, vertexClipPos);
        let e2 = edgeFunction(maskP2, maskP0, vertexClipPos);
        return (((e0 > 0f) || (e1 > 0f)) || (e2 > 0f));
      }

      @group(0) @binding(6) var<uniform> shiftedColorsUniform: array<vec4f, 3>;

      struct midgroundFragment_Input {
        @builtin(position) outPos: vec4f,
        @location(0) @interpolate(flat) maskP0: vec2f,
        @location(1) @interpolate(flat) maskP1: vec2f,
        @location(2) @interpolate(flat) maskP2: vec2f,
        @location(3) vertexClipPos: vec2f,
      }

      @fragment fn midgroundFragment(_arg_0: midgroundFragment_Input) -> @location(0) vec4f {
        if (((drawOverNeighborsUniform == 0u) && isOutsideMask(_arg_0.maskP0, _arg_0.maskP1, _arg_0.maskP2, _arg_0.vertexClipPos))) {
          discard;;
        }
        return shiftedColorsUniform[1i];
      }

      const originalVertices: array<vec2f, 3> = array<vec2f, 3>(vec2f(0.8660253882408142, -0.5), vec2f(0, 1), vec2f(-0.8660253882408142, -0.5));

      struct InstanceInfo {
        offset: vec2f,
        rotationAngle: f32,
      }

      @group(1) @binding(0) var<storage, read> instanceInfo: array<InstanceInfo>;

      fn interpolate(inputValue: f32, inputLowerEndpoint: f32, inputUpperEndpoint: f32, outputLowerEndpoint: f32, outputUpperEndpoint: f32) -> f32 {
        let inputProgress = (inputValue - inputLowerEndpoint);
        let inputInterval = (inputUpperEndpoint - inputLowerEndpoint);
        let progressPercentage = (inputProgress / inputInterval);
        let outputInterval = (outputUpperEndpoint - outputLowerEndpoint);
        let outputValue = (outputLowerEndpoint + (outputInterval * progressPercentage));
        return outputValue;
      }

      fn interpolateBezier(inputValue: f32, outputLowerEndpoint: f32, outputUpperEndpoint: f32) -> f32 {
        return interpolate(inputValue, 0f, 1f, outputLowerEndpoint, outputUpperEndpoint);
      }

      @group(0) @binding(0) var<uniform> animationProgressUniform: f32;

      @group(0) @binding(1) var<uniform> stepRotationUniform: f32;

      fn rotate(coordinate: vec2f, angleInDegrees: f32) -> vec2f {
        let angle = ((angleInDegrees * 3.141592653589793f) / 180f);
        let x = coordinate.x;
        let y = coordinate.y;
        return vec2f(((x * cos(angle)) - (y * sin(angle))), ((x * sin(angle)) + (y * cos(angle))));
      }

      fn getZeroOffset(scaleValue: f32, aspectRatioValue: f32) -> vec2f {
        let zeroXOffset = ((0.8660254037844386f * scaleValue) - (1f * aspectRatioValue));
        let zeroYOffset = (1f - scaleValue);
        return vec2f(zeroXOffset, zeroYOffset);
      }

      fn instanceTransform(position: vec2f, instanceInfo_1: InstanceInfo, scaleValue: f32, aspectRatioValue: f32) -> vec2f {
        var transformedPoint = (rotate((position * scaleValue), instanceInfo_1.rotationAngle) + (instanceInfo_1.offset + getZeroOffset(scaleValue, aspectRatioValue)));
        return (mat2x2f((1f / aspectRatioValue), 0f, 0f, 1f) * transformedPoint);
      }

      @group(0) @binding(2) var<uniform> scaleUniform: f32;

      @group(0) @binding(3) var<uniform> aspectRatioUniform: f32;

      struct foregroundVertex_Output {
        @builtin(position) outPos: vec4f,
      }

      struct foregroundVertex_Input {
        @builtin(vertex_index) vertexIndex: u32,
        @builtin(instance_index) instanceIndex: u32,
      }

      @vertex fn foregroundVertex(_arg_0: foregroundVertex_Input) -> foregroundVertex_Output {
        var vertexPosition = originalVertices[_arg_0.vertexIndex];
        var calculatedPosition = (mat2x2f(0.5, 0, 0, 0.5) * vertexPosition);
        let instanceInfo_1 = (&instanceInfo[_arg_0.instanceIndex]);
        let angle = interpolateBezier(animationProgressUniform, 0f, stepRotationUniform);
        let scaleFactor = animationProgressUniform;
        calculatedPosition = (rotate(calculatedPosition, angle) * scaleFactor);
        var finalPosition = instanceTransform(calculatedPosition, (*instanceInfo_1), scaleUniform, aspectRatioUniform);
        return foregroundVertex_Output(vec4f(finalPosition, 0f, 1f));
      }

      @group(0) @binding(4) var<uniform> shiftedColorsUniform: array<vec4f, 3>;

      @fragment fn foregroundFragment() -> @location(0) vec4f {
        var color = shiftedColorsUniform[2i];
        return color;
      }"
    `);
  });
});
