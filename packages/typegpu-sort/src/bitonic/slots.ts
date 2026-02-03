import tgpu, { d } from 'typegpu';

/** Default comparison function: ascending order (a < b means a comes before b) */
export const defaultCompare = tgpu.fn([d.u32, d.u32], d.bool)((a, b) => a < b);

/** Slot for customizing the comparison function in bitonic sort.
 * The function should return true if the first argument should come before the second. */
export const compareSlot = tgpu.slot<(a: number, b: number) => boolean>(
  defaultCompare,
);
