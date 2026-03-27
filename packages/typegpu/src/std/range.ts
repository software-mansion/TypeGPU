import { comptime } from '../core/function/comptime.ts';

export interface TgpuRange extends Array<number> {
  start: number;
  end: number;
  step: number;
}

export const range = comptime((start: number, end?: number, step: number = 1): TgpuRange => {
  if (end === undefined) {
    // range(n)
    end = start;
    start = 0;
  }
  if (step === 0) {
    throw new Error('Step cannot be zero');
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
