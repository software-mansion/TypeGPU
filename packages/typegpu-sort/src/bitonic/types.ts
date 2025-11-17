import type { TgpuQuerySet } from 'typegpu';

export interface BitonicSorterOptions {
  /** Custom comparison function. Returns true if first argument should come before second.
   * Default: ascending order (a < b) */
  compare?: (a: number, b: number) => boolean;
  /**
   * Value used to pad arrays to power-of-2 length. Must sort to the end with your comparator.
   * Default: `0xFFFFFFFF` (works for ascending). For descending order, use `0`.
   */
  paddingValue?: number;
}

export interface BitonicSorterRunOptions {
  /**
   * Optional timestamp query set for GPU timing. Must have at least 2 entries.
   * Timestamps are written to indices 0 and 1. For non-power-of-2 arrays, timing
   * includes the padding copy passes.
   */
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
