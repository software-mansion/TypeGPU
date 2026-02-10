import type { AnyFn } from '../core/function/fnTypes.ts';
import { min, sin } from '../std/numeric.ts';
import type { DualFn } from '../types.ts';

export const mathToStd: Record<string, DualFn<AnyFn>> = {
  sin,
  min,
} satisfies Partial<Record<keyof typeof Math, DualFn<AnyFn>>>;
