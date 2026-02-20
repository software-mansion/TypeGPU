import type { TgpuQuerySet } from 'typegpu';

export interface BitonicSorterOptions {
  /** Custom comparison function. Returns true if first argument should come before second.
   * Default: ascending order (a < b) */
  compare?: (a: number, b: number) => boolean;
  /** Value used to pad arrays to power-of-2 length.
   * Default: 0xFFFFFFFF (MAX_UINT) for ascending, use 0 for descending */
  paddingValue?: number;
}

export interface BitonicSorterRunOptions {
  /** Optional timestamp query set for GPU timing.
   * Must have at least 2 entries. Timestamps are written to indices 0 and 1. */
  querySet?: TgpuQuerySet<'timestamp'>;
}

export interface BitonicSorter {
  /** Original size of the input array */
  readonly originalSize: number;
  /** Size after padding to power of 2 */
  readonly paddedSize: number;
  /** Whether the array was padded */
  readonly wasPadded: boolean;

  /** Execute the sort. Can be called repeatedly. */
  run(options?: BitonicSorterRunOptions): void;

  /** Clean up all GPU resources. */
  destroy(): void;
}
