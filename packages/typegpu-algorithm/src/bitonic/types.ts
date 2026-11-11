import type { d, StorageFlag, TgpuBuffer, TgpuComputePipeline } from 'typegpu';
import type { ComputePass } from '../instance.ts';
import type {
  BitonicKeyType,
  BitonicLayouts,
  stepLayout,
  stepUniformsType,
  validLayout,
} from './kernels.ts';

/**
 * Options that shape the generated shaders of a bitonic sort.
 * @category Module
 */
export interface BitonicSortOptions<
  TKey extends BitonicKeyType = BitonicKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
> {
  /** Element type of the key buffer */
  keyType: TKey;
  /** Element type of the payload buffer reordered alongside the keys, if any */
  valueType?: TValue | undefined;
  /**
   * Custom `'use gpu'` comparison function. Returns true if the first argument should come
   * before the second. Defaults to ascending order (a < b)
   */
  compare?: ((a: number, b: number) => boolean) | undefined;
}

/**
 * Buffers a bitonic sort instance sorts in place.
 * @category Module
 */
export interface BitonicSortIo<
  TKey extends BitonicKeyType = BitonicKeyType,
  TValue extends d.AnyWgslData = d.AnyWgslData,
> {
  /** The keys to sort in place. Any size, padded to a power of two internally */
  keys: TgpuBuffer<d.WgslArray<TKey>> & StorageFlag;
  /**
   * Payload buffer reordered alongside the keys, e.g. indices into another data structure.
   * Must have the same element count as the keys. Required when the definition has a
   * `valueType`.
   */
  values?: (TgpuBuffer<d.WgslArray<TValue>> & StorageFlag) | undefined;
}

/**
 * The pipelines sorting a power-of-two buffer. Sorting stages small enough to fit in
 * workgroup memory run in `localSort`/`localMerge` when the device allows
 * `localStorageSize` bytes of it, otherwise every stage runs in `globalStep`.
 * @category Module
 */
export interface BitonicSortVariant {
  /** Bytes of workgroup memory `localSort` and `localMerge` need */
  readonly localStorageSize: number;
  readonly globalStep: TgpuComputePipeline;
  readonly localSort: TgpuComputePipeline;
  readonly localMerge: TgpuComputePipeline;
}

/**
 * Pipelines and layouts of a bitonic sort, shared by every instance and every buffer size.
 * @category Module
 */
export interface BitonicSortDefinition {
  readonly keyType: BitonicKeyType;
  readonly valueType: d.AnyWgslData | undefined;
  readonly keyArray: (elementCount: number) => d.WgslArray<BitonicKeyType>;
  readonly valueArray: ((elementCount: number) => d.WgslArray<d.AnyWgslData>) | undefined;
  readonly validArray: (elementCount: number) => d.WgslArray<d.U32>;
  readonly stepUniformsType: typeof stepUniformsType;
  readonly dataLayout: BitonicLayouts['dataLayout'];
  readonly valsLayout: BitonicLayouts['valsLayout'];
  readonly copyLayout: BitonicLayouts['copyLayout'];
  readonly valuesCopyLayout: BitonicLayouts['valuesCopyLayout'];
  readonly validLayout: typeof validLayout;
  readonly stepLayout: typeof stepLayout;
  /** For power-of-two sizes, sorted in place */
  readonly dense: BitonicSortVariant;
  /** For other sizes, sorted in padded copies that track which elements are padding */
  readonly padded: BitonicSortVariant;
  /** Copies into the padded buffers */
  readonly pad: TgpuComputePipeline;
  /** Copies out of the padded buffers */
  readonly unpad: TgpuComputePipeline;
}

/**
 * Sorts one set of buffers. All GPU resources, including a uniform buffer per sorting stage,
 * are created up front, so `step` only records dispatches.
 * @category Module
 */
export interface BitonicSortInstance {
  /** Number of keys */
  readonly size: number;
  /** Size the keys are padded to, a power of two */
  readonly paddedSize: number;
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
