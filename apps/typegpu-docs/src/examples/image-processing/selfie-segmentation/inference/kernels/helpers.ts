import tgpu, { d, std } from 'typegpu';
import { headLayout, weightedLayout } from './layouts.ts';

export type Vec4Op = (value: d.v4f) => d.v4f;
export type BinaryOp = (a: d.v4f, b: d.v4f) => d.v4f;

export const identityOp = (value: d.v4f) => {
  'use gpu';
  return d.vec4f(value);
};

export const reluOp = (value: d.v4f) => {
  'use gpu';
  return std.max(value, d.vec4f(0));
};

export const hardSwishOp = (value: d.v4f) => {
  'use gpu';
  return value * std.saturate((value + 3) / 6);
};

export const sigmoidOp = (value: d.v4f) => {
  'use gpu';
  return d.vec4f(1) / (d.vec4f(1) + std.exp(value * -1));
};

export const addOp = (a: d.v4f, b: d.v4f) => {
  'use gpu';
  return a + b;
};

export const mulOp = (a: d.v4f, b: d.v4f) => {
  'use gpu';
  return a * b;
};

export const activationSlot = tgpu.slot<Vec4Op>(identityOp);
export const binaryOpSlot = tgpu.slot<BinaryOp>(addOp);

export const hwc4Index = (y: number, x: number, block: number, width: number, blocks: number) => {
  'use gpu';
  return (y * width + x) * blocks + block;
};

export const blockedPixel = (i: number, width: number, blocks: number) => {
  'use gpu';
  const block = i % blocks;
  const pixel = d.u32(i / blocks);
  return d.vec3u(pixel % width, d.u32(pixel / width), block);
};

export const inputCoord = (outCoord: number, kernel: number, stride: number, pad: number) => {
  'use gpu';
  return d.i32(outCoord * stride + kernel) - d.i32(pad);
};

export const outOfBounds = (coord: number, size: number) => {
  'use gpu';
  return coord < 0 || coord >= d.i32(size);
};

export const sigmoidScalar = (value: number) => {
  'use gpu';
  return 1 / (1 + std.exp(-value));
};

export const packedWeightAt = (base: number) => {
  'use gpu';
  const wordBase = base * 2;
  const xy = std.unpack2x16float(weightedLayout.$.weights[wordBase]);
  const zw = std.unpack2x16float(weightedLayout.$.weights[wordBase + 1]);
  return d.vec4f(xy, zw);
};

export const packedHeadWeightAt = (base: number) => {
  'use gpu';
  const wordBase = base * 2;
  const xy = std.unpack2x16float(headLayout.$.weights[wordBase]);
  const zw = std.unpack2x16float(headLayout.$.weights[wordBase + 1]);
  return d.vec4f(xy, zw);
};

export const packedDot4 = (value: d.v4f, weightBase: number) => {
  'use gpu';
  return d.vec4f(
    std.dot(value, packedWeightAt(weightBase)),
    std.dot(value, packedWeightAt(weightBase + 1)),
    std.dot(value, packedWeightAt(weightBase + 2)),
    std.dot(value, packedWeightAt(weightBase + 3)),
  );
};
