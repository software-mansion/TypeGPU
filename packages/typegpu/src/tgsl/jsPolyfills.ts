import type { AnyFn } from '../core/function/fnTypes.ts';
import { f32 } from '../data/numeric.ts';
import {
  abs,
  acos,
  acosh,
  asin,
  asinh,
  atan,
  atan2,
  atanh,
  ceil,
  cos,
  cosh,
  countLeadingZeros,
  exp,
  floor,
  log,
  log2,
  max,
  min,
  pow,
  sign,
  sin,
  sinh,
  sqrt,
  tan,
  tanh,
  trunc,
} from '../std/numeric.ts';
import type { DualFn } from '../types.ts';

export const mathToStd = new Map<AnyFn, DualFn<AnyFn>>([
  // -- one to one Math to WGSL correlation --
  [Math.abs, abs],
  [Math.acos, acos],
  [Math.acosh, acosh],
  [Math.asin, asin],
  [Math.asinh, asinh],
  [Math.atan, atan],
  [Math.atan2, atan2],
  [Math.atanh, atanh],
  [Math.ceil, ceil],
  [Math.cos, cos],
  [Math.cosh, cosh],
  [Math.exp, exp],
  [Math.floor, floor],
  [Math.fround, f32 as DualFn<AnyFn>],
  [Math.clz32, countLeadingZeros],
  [Math.trunc, trunc],
  [Math.log, log],
  [Math.log2, log2],
  [Math.pow, pow],
  [Math.sign, sign],
  [Math.sin, sin],
  [Math.sinh, sinh],
  [Math.sqrt, sqrt],
  [Math.tan, tan],
  [Math.tanh, tanh],
  // -- varying in Math and two arg in WGSL, but we support varying in std --
  [Math.max, max],
  [Math.min, min],
  // -- possible if we extend std --
  // [Math.cbrt, ???],
  // [Math.log10, ???],
  // [Math.log1p, ???],
  // [Math.f16round, ???],
  // [Math.hypot, ???],
  // [Math.expm1, ???],
  // -- skipped --
  // [Math.random, ???],
  // [Math.imul, ???],
  // [Math.round, ???], // round(2.5) is 3 in JS and 2 in WGSL
]);

// deferring the array creation lets us handle console mocks
export const supportedLogOps = () =>
  [console.log, console.debug, console.info, console.warn, console.error, console.clear] as const;
