import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { InstanceInfo } from './instanceInfo.ts';
import { aspectRatioBuffer, scaleBuffer } from './buffers.ts';
import { BASE_TRIANGLE_HALF_SIDE } from './geometry.ts';

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
    const outputValue = outputLowerEndpoint +
      outputInterval * progressPercentage;
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
  const transformedPoint = std.add(
    // rotate accordingly
    rotate(
      std.mul(position, scaleBuffer.$),
      instanceInfo.rotationAngle,
    ),
    // add instance offsets with top left corner offset
    std.add(
      instanceInfo.offset,
      getZeroOffset(),
    ),
  );

  // squish/stretch triangles horizontally
  return d.mat2x2f(1 / aspectRatioBuffer.$, 0, 0, 1).mul(transformedPoint);
}

// common offset so that the first triangle's
// top vertex lies on top of canvas's top left corner
function getZeroOffset() {
  'use gpu';
  const zeroXOffset = BASE_TRIANGLE_HALF_SIDE * scaleBuffer.$ -
    1 * aspectRatioBuffer.$;
  // make the top of the very first triangle touch the border
  const zeroYOffset = 1 - scaleBuffer.$;

  return d.vec2f(zeroXOffset, zeroYOffset);
}

export { instanceTransform, interpolateBezier, rotate };
