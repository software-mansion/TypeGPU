import { tgpu, d } from 'typegpu';

/** Default comparison function: ascending order (a < b means a comes before b) */
export const defaultCompare = tgpu.fn([d.u32, d.u32], d.bool)((a, b) => a < b);

const defaultCompareI32 = tgpu.fn([d.i32, d.i32], d.bool)((a, b) => a < b);
const defaultCompareF32 = tgpu.fn([d.f32, d.f32], d.bool)((a, b) => a < b);

export const defaultCompares = {
  u32: defaultCompare,
  i32: defaultCompareI32,
  f32: defaultCompareF32,
} as const;

export const defaultPaddingValues = {
  u32: 0xffffffff,
  i32: 2147483647,
  f32: Number.POSITIVE_INFINITY,
} as const;

/** Slot for customizing the comparison function in bitonic sort.
 * The function should return true if the first argument should come before the second. */
export const compareSlot = tgpu.slot<(a: number, b: number) => boolean>(defaultCompare);
