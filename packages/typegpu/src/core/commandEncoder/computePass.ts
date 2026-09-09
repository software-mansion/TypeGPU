import type { PrimitiveOffsetInfo } from '../../data/offsetUtils.ts';
import type { AnyWgslData } from '../../data/wgslTypes.ts';
import type { InferInput } from '../../shared/repr.ts';
import { $internal } from '../../shared/symbols.ts';
import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import { isGPUBuffer } from '../../types.ts';
import type { IndirectFlag, TgpuBuffer } from '../buffer/buffer.ts';
import { setImmediateSnapshot, type TgpuImmediateVar } from '../immediate/immediateVar.ts';
import { DISPATCH_INDIRECT_SIZE, resolveIndirectOffset } from '../pipeline/pipelineUtils.ts';
import {
  ComputeDrawState,
  emitComputeDispatch,
  recordBindGroup,
  stampComputePipeline,
} from '../pipeline/drawState.ts';
import type { TgpuComputePipeline } from '../pipeline/computePipeline.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import { type TgpuPassTimestampWrites, unwrapTimestampWrites } from './attachments.ts';
import type { TgpuCommandEncoder } from './commandEncoder.ts';

// ----------
// Public API
// ----------

/**
 * The TypeGPU equivalent of {@link GPUComputePassDescriptor}.
 * Query sets accept TypeGPU query sets next to raw {@link GPUQuerySet}s.
 */
export interface TgpuComputePassDescriptor {
  label?: string | undefined;
  timestampWrites?: TgpuPassTimestampWrites | undefined;
}

export interface ComputePassInternals {
  readonly rawPass: GPUComputePassEncoder;
  readonly state: ComputeDrawState;
  /** Undefined for raw pass encoders the caller owns */
  readonly owner: TgpuCommandEncoder | undefined;
  appliedVersion: number | undefined;
}

/**
 * A compute pass recording into a {@link TgpuCommandEncoder}.
 *
 * Dispatch either by binding TypeGPU pipelines to it
 * (`pipeline.with(pass).dispatchWorkgroups(...)`), or proxy-style via
 * `pass.setPipeline(pipeline)` followed by `pass.dispatchWorkgroups(...)`.
 *
 * Call `end()` when done recording.
 */
export interface TgpuComputePass {
  readonly [$internal]: ComputePassInternals;
  readonly resourceType: 'compute-pass';

  /** Sets the current {@link TgpuComputePipeline} for subsequent dispatches */
  setPipeline(pipeline: TgpuComputePipeline): void;

  /** Associates a bind group with the layout it was created from */
  setBindGroup(bindGroup: TgpuBindGroup): void;
  /** Associates a bind group with the given layout */
  setBindGroup<Entries extends Record<string, TgpuLayoutEntry | null>>(
    bindGroupLayout: TgpuBindGroupLayout<Entries>,
    bindGroup: TgpuBindGroup<Entries> | GPUBindGroup,
  ): void;

  /**
   * Provides a value for the given immediate variable, used by subsequent dispatches.
   * The value is captured (copied) at call time; mutating it afterwards has no
   * effect until it is set again. Binding a pipeline carrying its own
   * immediate value (`pipeline.with(immediate, value)`) overwrites it, like
   * any other pipeline-held state.
   *
   * Passing an `ArrayBuffer` or typed array skips serialization entirely; the bytes
   * are copied verbatim and the caller guarantees they match the schema's layout.
   */
  setImmediates<T extends AnyWgslData>(
    immediate: TgpuImmediateVar<T>,
    value: InferInput<T> | ArrayBuffer | ArrayBufferView,
  ): void;

  dispatchWorkgroups(x: number, y?: number, z?: number): void;

  /**
   * Dispatches compute workgroups using parameters read from a buffer.
   * The buffer must contain 3 consecutive u32 values (x, y, z workgroup counts).
   * To get the correct offset within complex data structures, use `d.memoryLayoutOf(...)`.
   *
   * @param indirectBuffer - Buffer marked with 'indirect' usage containing dispatch parameters or raw GPUBuffer
   * @param start - PrimitiveOffsetInfo pointing to the first dispatch parameter. If not provided, starts at offset 0. To obtain safe offsets, use `d.memoryLayoutOf(...)`.
   */
  dispatchWorkgroupsIndirect<T extends AnyWgslData>(
    indirectBuffer: (TgpuBuffer<T> & IndirectFlag) | GPUBuffer,
    start?: PrimitiveOffsetInfo | number,
  ): void;

  /** Completes the recording of this compute pass */
  end(): void;
}

// --------------
// Implementation
// --------------

export function INTERNAL_beginComputePass(
  encoder: TgpuCommandEncoder,
  descriptor?: TgpuComputePassDescriptor,
): TgpuComputePass {
  const { rawEncoder, root } = encoder[$internal];
  const rawDescriptor: GPUComputePassDescriptor = {};

  if (descriptor?.label !== undefined) {
    rawDescriptor.label = descriptor.label;
  }

  if (descriptor?.timestampWrites !== undefined) {
    rawDescriptor.timestampWrites = unwrapTimestampWrites(root, descriptor.timestampWrites);
  }

  return new TgpuComputePassImpl(root, rawEncoder.beginComputePass(rawDescriptor), encoder);
}

export function INTERNAL_adoptComputePass(
  root: ExperimentalTgpuRoot,
  rawPass: GPUComputePassEncoder,
): TgpuComputePass {
  const adopted = new TgpuComputePassImpl(root, rawPass, undefined);
  adopted[$internal].state.rawAccessed = true;
  return adopted;
}

class TgpuComputePassImpl implements TgpuComputePass {
  readonly [$internal]: ComputePassInternals;
  readonly resourceType = 'compute-pass';
  readonly #root: ExperimentalTgpuRoot;

  constructor(
    root: ExperimentalTgpuRoot,
    rawPass: GPUComputePassEncoder,
    owner: TgpuCommandEncoder | undefined,
  ) {
    this.#root = root;
    this[$internal] = {
      rawPass,
      state: new ComputeDrawState(),
      owner,
      appliedVersion: undefined,
    };
  }

  #emit(emit: (rawPass: GPUComputePassEncoder) => void): void {
    const internals = this[$internal];
    const pipeline = internals.state.currentPipeline;

    if (!pipeline) {
      throw new Error('Cannot dispatch without a call to pass.setPipeline');
    }

    emitComputeDispatch(this.#root, internals, pipeline, emit);
  }

  setPipeline(pipeline: TgpuComputePipeline): void {
    stampComputePipeline(this[$internal].state, pipeline);
  }

  setBindGroup<Entries extends Record<string, TgpuLayoutEntry | null>>(
    first: TgpuBindGroup | TgpuBindGroupLayout<Entries>,
    bindGroup?: TgpuBindGroup<Entries> | GPUBindGroup,
  ): void {
    recordBindGroup(this[$internal].state, first as TgpuBindGroup | TgpuBindGroupLayout, bindGroup);
  }

  setImmediates<T extends AnyWgslData>(
    immediate: TgpuImmediateVar<T>,
    value: InferInput<T> | ArrayBuffer | ArrayBufferView,
  ): void {
    setImmediateSnapshot(this[$internal].state.immediates, immediate, value);
  }

  dispatchWorkgroups(x: number, y?: number, z?: number): void {
    this.#emit((rawPass) => rawPass.dispatchWorkgroups(x, y, z));
  }

  dispatchWorkgroupsIndirect<T extends AnyWgslData>(
    indirectBuffer: (TgpuBuffer<T> & IndirectFlag) | GPUBuffer,
    start?: PrimitiveOffsetInfo | number,
  ): void {
    const rawBuffer = isGPUBuffer(indirectBuffer) ? indirectBuffer : indirectBuffer.buffer;
    const offset = resolveIndirectOffset(
      indirectBuffer,
      start,
      DISPATCH_INDIRECT_SIZE,
      'dispatchWorkgroupsIndirect',
    );

    this.#emit((rawPass) => rawPass.dispatchWorkgroupsIndirect(rawBuffer, offset));
  }

  end(): void {
    this[$internal].rawPass.end();
  }
}
