import type { TgpuCommandEncoder, TgpuComputePass } from 'typegpu';

interface EncoderOptions {
  /** Records the dispatches as a single compute pass on this encoder. Nothing is submitted */
  encoder: GPUCommandEncoder | TgpuCommandEncoder;
  pass?: never;
}

interface PassOptions {
  encoder?: never;
  /** Records the dispatches into this pass. Nothing is submitted and the pass is not ended */
  pass: GPUComputePassEncoder | TgpuComputePass;
}

/** Controls where a `run` call records its dispatches. Defaults to a standalone submit */
export type RunOptions = EncoderOptions | PassOptions;

export interface Sorter {
  /** Number of elements this sorter was created for */
  readonly size: number;
  /** Eagerly initializes every pipeline synchronously. Calling this is optional */
  initSync(): void;
  /** Eagerly initializes every pipeline asynchronously. Calling this is optional */
  initAsync(): Promise<void>;
  /** Sorts the buffer in place. Can be called repeatedly */
  run(options?: RunOptions): void;
  /** Destroys the internal buffers owned by this sorter */
  destroy(): void;
}
