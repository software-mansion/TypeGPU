import type { d, StorageFlag, TgpuBuffer, TgpuComputePipeline } from 'typegpu';
import type { ComputePass } from '../instance.ts';
import type { PrefixScanDefinition } from '../scan/types.ts';
import type {
  histLayout,
  RadixKeyType,
  RadixSchemas,
  shiftLayout,
  SortDirection,
} from './schemas.ts';

/**
 * Options that shape the generated shaders of a radix sort.
 * @category Module
 */
export interface RadixSortOptions<
  TKey extends RadixKeyType = RadixKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
> {
  /** Element type of the key buffers */
  keyType: TKey;
  /** Element type of the payload buffers reordered alongside the keys, if any */
  valueType?: TValue | undefined;
  /** Sort order. Defaults to `'ascending'` */
  direction?: SortDirection;
  /**
   * Inclusive range the keys lie in, keys outside are clamped to it. Integer keys are
   * offset so `min` maps to 0 and `keyBits` defaults to the bits `max - min` needs. Float
   * keys are quantized to `keyBits` evenly spaced buckets, keys in the same bucket keep
   * their input order
   */
  range?: [min: number, max: number];
  /**
   * Number of low bits of the mapped key that decide the order. Every 8 bits cost one pass
   * over the data. Defaults to what `range` needs, or 32. Below 32 on `i32` and `f32` keys
   * only with `range` or `key`
   */
  keyBits?: number;
  /**
   * Maps a raw key to a `u32` whose numeric order is the sort order, replacing the built-in
   * map of the key type. Composes with `direction` and `keyBits`
   */
  key?: (key: number) => number;
}

/**
 * Buffers a radix sort instance reads and writes. Every buffer has the same element count.
 * @category Module
 */
export interface RadixSortIo<
  TKey extends RadixKeyType = RadixKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
> {
  /** The keys to sort, in place unless `out` is given */
  keys: TgpuBuffer<d.WgslArray<TKey>> & StorageFlag;
  /**
   * Payload buffer reordered alongside the keys, e.g. indices into another data structure.
   * Required when the definition has a `valueType`.
   */
  values?: (TgpuBuffer<d.WgslArray<TValue>> & StorageFlag) | undefined;
  /**
   * Buffers receiving the sorted keys and values, leaving the inputs untouched. Defaults
   * to sorting in place. `values` requires `out.values` and vice versa.
   */
  out?: {
    keys: TgpuBuffer<d.WgslArray<TKey>> & StorageFlag;
    values?: (TgpuBuffer<d.WgslArray<TValue>> & StorageFlag) | undefined;
  };
}

/**
 * Pipelines and layouts of a radix sort, shared by every instance and every buffer size.
 * @category Module
 */
export interface RadixSortDefinition {
  readonly keyType: RadixKeyType;
  readonly valueType: d.AnyWgslData | undefined;
  /** Number of 8-bit digit passes */
  readonly numPasses: number;
  readonly keyArray: (elementCount: number) => d.WgslArray<RadixKeyType>;
  readonly valueArray: ((elementCount: number) => d.WgslArray<d.AnyWgslData>) | undefined;
  readonly histArray: (elementCount: number) => d.WgslArray<d.U32>;
  readonly shiftType: d.U32;
  readonly ioLayout: RadixSchemas['ioLayout'];
  readonly valuesLayout: RadixSchemas['valuesLayout'];
  readonly histLayout: typeof histLayout;
  readonly shiftLayout: typeof shiftLayout;
  readonly count: TgpuComputePipeline;
  readonly scatter: TgpuComputePipeline;
  readonly copy: TgpuComputePipeline;
  /** Exclusive sum over the per-tile digit histogram */
  readonly scan: PrefixScanDefinition<d.U32>;
}

/**
 * Sorts one set of buffers. All GPU resources are created up front, so `step` only records
 * dispatches.
 * @category Module
 */
export interface RadixSortInstance {
  /** Number of keys */
  readonly size: number;
  /** Records the whole sort into `pass`. Doesn't end the pass or submit */
  step(pass: ComputePass): void;
  /** Eagerly compiles the pipelines this instance dispatches. Calling this is optional */
  initSync(): void;
  /** Eagerly compiles the pipelines this instance dispatches. Calling this is optional */
  initAsync(): Promise<void>;
  /** Destroys the internal buffers owned by this instance */
  destroy(): void;
  [Symbol.dispose](): void;
}
