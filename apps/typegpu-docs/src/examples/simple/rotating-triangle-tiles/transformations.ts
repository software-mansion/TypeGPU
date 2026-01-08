import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { InstanceInfo } from './instanceInfo.ts';
import { gridParamsBuffer } from './buffers.ts';
import { baseTriangleHalfHeight } from './geometry.ts';

const interpolate = tgpu.fn(
  [d.f32, d.f32, d.f32, d.f32, d.f32],
  d.f32,
)(
  (
    inputValue: number,
    inputLowerEndpoint: number,
    inputUpperEndpoint: number,
    outputLowerEndpoint: number,
    outputUpperEndpoint: number,
  ) => {
    const inputProgress = inputValue - inputLowerEndpoint;
    const inputInterval = inputUpperEndpoint - inputLowerEndpoint;
    const progressPercentage = inputProgress / inputInterval;
    const outputInterval = std.sub(outputUpperEndpoint, outputLowerEndpoint);
    const outputValue =
      outputLowerEndpoint + outputInterval * progressPercentage;
    return outputValue;
  },
);

const interpolateBezier = tgpu.fn(
  [d.f32, d.f32, d.f32],
  d.f32,
)(
  (
    inputValue: number,
    outputLowerEndpoint: number,
    outputUpperEndpoint: number,
  ) => {
    return interpolate(
      inputValue,
      d.f32(0),
      d.f32(1),
      outputLowerEndpoint,
      outputUpperEndpoint,
    );
  },
);

function rotate(coordinate: d.v2f, angleInDegrees: number) {
  'use gpu';
  const angle = (angleInDegrees * Math.PI) / 180;
  const x = coordinate.x;
  const y = coordinate.y;
  return d.vec2f(
    x * std.cos(angle) - y * std.sin(angle),
    x * std.sin(angle) + y * std.cos(angle),
  );
}

function instanceTransform(
  position: d.v2f,
  instanceInfo: d.Infer<typeof InstanceInfo>,
) {
  'use gpu';
  return std.add(
    std.add(
      rotate(
        std.mul(position, gridParamsBuffer.$.userScale),
        instanceInfo.rotationAngle,
      ),
      instanceInfo.offset,
    ),
    getZeroOffset(),
  );
}

function getZeroOffset() {
  'use gpu';
  const zeroXOffset = baseTriangleHalfHeight * gridParamsBuffer.$.userScale - 1;
  // make the top of the very first triangle touch the border
  const zeroYOffset = 1 - gridParamsBuffer.$.userScale;

  return d.vec2f(zeroXOffset, zeroYOffset);
}

export { interpolateBezier, rotate, instanceTransform };
