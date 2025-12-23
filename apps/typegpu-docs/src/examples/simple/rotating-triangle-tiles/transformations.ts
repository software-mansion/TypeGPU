import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

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

export { interpolateBezier, rotate };
