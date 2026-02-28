import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';
import type { BinaryOp } from '@typegpu/concurrent-scan';

// tgpu functions

export const addFn = tgpu.fn(
  [d.f32, d.f32],
  d.f32,
)((a, b) => {
  return a + b;
});

export const mulFn = tgpu.fn(
  [d.f32, d.f32],
  d.f32,
)((a, b) => {
  return a * b;
});

/**
 * Concats two numbers. Loses precision when the result has more than 7 digits.
 *
 * @example
 * concat10(123, 456); // 123456
 * concat10(123, 0); // 123, since 0 is considered to have 0 digits
 */
export const concat10 = tgpu.fn(
  [d.f32, d.f32],
  d.f32,
)((a, b) => {
  if (a === 0) return b;
  if (b === 0) return a;
  if (b === 1) return a * 10 + b;
  const digits = std.ceil(std.log(b) / std.log(10));
  const result = std.pow(10, digits) * a + b;
  const roundedResult = std.round(result);
  return roundedResult;
});

// JS helpers

function applyOp(op: BinaryOp, a: number | undefined, b: number | undefined): number {
  return op.operation(a as number & d.F32, b as number & d.F32);
}

export function prefixScanJS(arr: number[], op: BinaryOp) {
  const result = Array.from({ length: arr.length }, () => op.identityElement);
  for (let i = 1; i < arr.length; i++) {
    result[i] = applyOp(op, result[i - 1], arr[i - 1]);
  }
  return result;
}

export function scanJS(arr: number[], op: BinaryOp) {
  let result = op.identityElement;
  for (let i = 0; i < arr.length; i++) {
    result = applyOp(op, result, arr[i]);
  }
  return [result];
}

export function isArrayEqual(arr1: number[], arr2: number[]): boolean {
  return arr1.length === arr2.length && arr1.every((elem, i) => elem === arr2[i]);
}
