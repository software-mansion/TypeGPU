import { tgpu } from 'typegpu';

export function defaultCompare(a: number, b: number): boolean {
  'use gpu';
  return a < b;
}

export const defaultPaddingValues = {
  u32: 0xffffffff,
  i32: 2147483647,
  f32: Number.POSITIVE_INFINITY,
} as const;

export const compareSlot = tgpu.slot<(a: number, b: number) => boolean>();
