import { d, std, tgpu } from 'typegpu';

export type Vec4Activation = (value: d.v4f) => d.v4f;

export const identityActivation = (value: d.v4f) => {
  'use gpu';
  return d.vec4f(value);
};

export const hwc4Index = (
  y: number,
  x: number,
  channelBlock: number,
  width: number,
  channelBlocks: number,
) => {
  'use gpu';
  return (y * width + x) * channelBlocks + channelBlock;
};

/** Returns `(x, y, channelBlock)` for a flat HWC4 element index */
export const blockedElement = (index: number, width: number, channelBlocks: number) => {
  'use gpu';
  const channelBlock = index % channelBlocks;
  const pixel = std.intdiv(index, channelBlocks);
  return d.vec3u(pixel % width, std.intdiv(pixel, width), channelBlock);
};

export const inputCoordinate = (
  outputCoordinate: number,
  kernelCoordinate: number,
  stride: number,
  padding: number,
) => {
  'use gpu';
  return d.i32(outputCoordinate * stride) + d.i32(kernelCoordinate) - d.i32(padding);
};

export const coordinateOutOfBounds = (coordinate: number, size: number) => {
  'use gpu';
  return coordinate < 0 || coordinate >= d.i32(size);
};

export const maskPaddedChannels = (value: d.v4f, channelBlock: number, logicalChannels: number) => {
  'use gpu';
  const baseChannel = channelBlock * 4;
  return std.select(
    d.vec4f(0),
    value,
    std.lt(d.vec4u(baseChannel) + d.vec4u(0, 1, 2, 3), d.vec4u(logicalChannels)),
  );
};

/** Abramowitz-Stegun erf approximation; maximum absolute error is about 1.5e-7 */
export const erfApprox = (value: d.v4f) => {
  'use gpu';
  const absolute = std.abs(value);
  const t = d.vec4f(1) / (d.vec4f(1) + absolute * 0.3275911);
  const polynomial =
    ((((t * 1.061405429 - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return std.sign(value) * (d.vec4f(1) - polynomial * std.exp(d.vec4f(0) - value * value));
};

export const geluExact = (value: d.v4f) => {
  'use gpu';
  return value * 0.5 * (d.vec4f(1) + erfApprox(value * Math.SQRT1_2));
};

export const silu = (value: d.v4f) => {
  'use gpu';
  return value / (d.vec4f(1) + std.exp(d.vec4f(0) - value));
};

export const relu = (value: d.v4f) => {
  'use gpu';
  return std.max(value, d.vec4f(0));
};

export const negated =
  (activation: Vec4Activation): Vec4Activation =>
  (value) => {
    'use gpu';
    return std.neg(activation(value));
  };

export const activationSlot = tgpu.slot<Vec4Activation>(identityActivation);

/** Four FP32 products of one value against an O4/I4 weight tile */
export const dotProductsO4I4 = (
  value: d.v4f,
  weight0: d.v4f,
  weight1: d.v4f,
  weight2: d.v4f,
  weight3: d.v4f,
) => {
  'use gpu';
  return d.vec4f(
    std.dot(value, weight0),
    std.dot(value, weight1),
    std.dot(value, weight2),
    std.dot(value, weight3),
  );
};

/** Four native-FP16 products against an O4/I4 weight tile, converted to FP32 */
export const halfDotProductsO4I4 = (
  value: d.v4h,
  weight0: d.v4h,
  weight1: d.v4h,
  weight2: d.v4h,
  weight3: d.v4h,
) => {
  'use gpu';
  return d.vec4f(
    d.f32(std.dot(value, weight0)),
    d.f32(std.dot(value, weight1)),
    d.f32(std.dot(value, weight2)),
    d.f32(std.dot(value, weight3)),
  );
};

/** PyTorch-compatible softplus with beta=1 and threshold=20 */
export const softplus = (value: number) => {
  'use gpu';
  if (value > 20) {
    return value;
  }
  if (value < -20) {
    return std.exp(value);
  }
  return std.log(1 + std.exp(value));
};

export const componentAt = (value: d.v4f, component: number) => {
  'use gpu';
  return value[component];
};
