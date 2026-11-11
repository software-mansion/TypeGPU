import type { d, StorageFlag, TgpuBuffer, TgpuComputePipeline } from 'typegpu';
import type { ComputePass } from '../instance.ts';
import type { ScanElementType, ScanSchemas } from './schemas.ts';

export interface BinaryOp {
  /** An associative operation, a `'use gpu'` function or a `std` function like `std.add` */
  operation: (a: number, b: number) => number;
  /** The value `x` for which `operation(identityElement, x) === x` */
  identityElement: number;
}

export type ScanBuffer<TElement extends ScanElementType = ScanElementType> = TgpuBuffer<
  d.WgslArray<TElement>
> &
  StorageFlag;

/** @category Module */
export interface PrefixScanOptions<
  TElement extends ScanElementType = ScanElementType,
> extends BinaryOp {
  /** Element type of the scanned buffers */
  elementType: TElement;
  /** Computes only the aggregate of the buffer instead of the full scan. Defaults to false */
  reduceOnly?: boolean;
}

/** @category Module */
export interface PrefixScanIo<TElement extends ScanElementType = ScanElementType> {
  /** The buffer to scan in place, or to reduce. Any size */
  buffer: ScanBuffer<TElement>;
}

/**
 * Pipelines and layouts of a prefix scan, shared by every instance and every buffer size.
 * @category Module
 */
export interface PrefixScanDefinition<TElement extends ScanElementType = ScanElementType> {
  readonly elementType: TElement;
  readonly reduceOnly: boolean;
  /** Schema of the per-level block sums the instance allocates */
  readonly sumsArray: (elementCount: number) => d.WgslArray<TElement>;
  readonly scanLayout: ScanSchemas['scanLayout'];
  readonly applySumsLayout: ScanSchemas['applySumsLayout'];
  readonly scan: TgpuComputePipeline;
  /** Adds the block sums back, only defined for a full scan */
  readonly applySums: TgpuComputePipeline | undefined;
}

/**
 * Scans (or reduces) one buffer. All scratch buffers and bind groups are created up front, so
 * `step` only records dispatches.
 * @category Module
 */
export interface PrefixScanInstance<TElement extends ScanElementType = ScanElementType> {
  /**
   * The buffer holding the result after the recorded work runs. For a full prefix scan this is
   * the scanned buffer itself, for a reduction a single-element buffer owned by the instance.
   */
  readonly resultBuffer: ScanBuffer<TElement>;
  /** Records the whole scan into `pass`. Doesn't end the pass or submit */
  step(pass: ComputePass): void;
  /** Eagerly compiles the pipelines this instance dispatches. Calling this is optional */
  initSync(): void;
  /** Eagerly compiles the pipelines this instance dispatches. Calling this is optional */
  initAsync(): Promise<void>;
  /** Destroys the scratch buffers owned by the instance, including a reduction's result buffer */
  destroy(): void;
  [Symbol.dispose](): void;
}
