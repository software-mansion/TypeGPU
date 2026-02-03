import type { TgpuQuerySet } from 'typegpu';

export interface BitonicSortOptions {
  /** Custom comparison function. Returns true if first argument should come before second.
   * Default: ascending order (a < b) */
  compare?: (a: number, b: number) => boolean;
  /** Value used to pad arrays to power-of-2 length.
   * Default: 0xFFFFFFFF (MAX_UINT) for ascending, use 0 for descending */
  paddingValue?: number;
  /** Optional timestamp query set for GPU timing.
   * Must have at least 2 entries. Timestamps are written to indices 0 and 1. */
  querySet?: TgpuQuerySet<'timestamp'>;
}

export interface BitonicSortResult {
  /** Original size of the input array */
  originalSize: number;
  /** Size after padding to power of 2 */
  paddedSize: number;
  /** Whether the array was padded */
  wasPadded: boolean;
}
