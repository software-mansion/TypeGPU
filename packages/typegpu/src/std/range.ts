import { comptime } from '../core/function/comptime.ts';

export interface TgpuRange extends Array<number> {
  start: number;
  end: number;
  step: number;
}

/**
 * Returns an array of values between `start` (inclusive) and `end` (exclusive) with the given `step`.
 *
 * If only one argument is provided, it is interpreted as `end`, with `start=0` and `step=1`.
 *
 * ```ts
 * let result = d.f32(1);
 * for (const i of std.range(5)) {
 *   result *= i + 1;
 * }
 * ```
 *
 * Can also be combined with `tgpu.unroll` to unroll a specific number of iterations.
 */
export const range = comptime<
  ((end: number) => TgpuRange) & ((start: number, end?: number, step?: number) => TgpuRange)
>((start: number, end?: number, step: number = 1): TgpuRange => {
  if (end === undefined) {
    // range(n)
    end = start;
    start = 0;
  }
  if (!Number.isInteger(start)) {
    throw new Error(`'start' must be an integer, got ${start}`);
  }
  if (!Number.isInteger(end)) {
    throw new Error(`'end' must be an integer, got ${end}`);
  }
  if (!Number.isInteger(step) || step === 0) {
    throw new Error(`'step' must be a non-zero integer, got ${step}`);
  }

  const result: TgpuRange = [] as unknown as TgpuRange;
  result.start = start;
  result.end = end;
  result.step = step;

  if (Math.sign(step) !== Math.sign(end - start)) {
    return result;
  }
  if (step > 0) {
    for (let i = start; i < end; i += step) {
      result.push(i);
    }
  }
  if (step < 0) {
    for (let i = start; i > end; i += step) {
      result.push(i);
    }
  }
  return result;
});

export function isTgpuRange(value: unknown): value is TgpuRange {
  return Array.isArray(value) && 'start' in value && 'end' in value && 'step' in value;
}
