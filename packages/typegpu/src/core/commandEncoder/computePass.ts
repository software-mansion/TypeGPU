import { $internal } from '../../shared/symbols.ts';
import {
  isBindGroup,
  type TgpuBindGroup,
  type TgpuBindGroupLayout,
  type TgpuLayoutEntry,
} from '../../tgpuBindGroupLayout.ts';
import { ComputeDrawState, emitComputeDispatch } from '../pipeline/drawState.ts';
import type { TgpuComputePipeline } from '../pipeline/computePipeline.ts';
import type { ExperimentalTgpuRoot } from '../root/rootTypes.ts';
import { type TgpuPassTimestampWrites, unwrapTimestampWrites } from './attachments.ts';
import type { TgpuCommandEncoder } from './commandEncoder.ts';

// ----------
// Public API
// ----------

/**
 * The TypeGPU equivalent of {@link GPUComputePassDescriptor}.
 * Query sets accept {@link TgpuQuerySet} next to raw {@link GPUQuerySet}s.
 */
export interface TgpuComputePassDescriptor {
  label?: string | undefined;
  timestampWrites?: TgpuPassTimestampWrites | undefined;
}

export interface ComputePassInternals {
  readonly rawPass: GPUComputePassEncoder;
  readonly state: ComputeDrawState;
  /**
   * The encoder this pass records into, when it is one we can defer work to.
   * Undefined for raw pass encoders the caller owns.
   */
  readonly owner: TgpuCommandEncoder | undefined;
  lastApplied: { pipeline: TgpuComputePipeline; version: number } | undefined;
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

  dispatchWorkgroups(x: number, y?: number, z?: number): void;
  dispatchWorkgroupsIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): void;

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
    rawDescriptor.timestampWrites = unwrapTimestampWrites(
      root,
      descriptor.timestampWrites,
    ) as GPUComputePassTimestampWrites;
  }

  return new TgpuComputePassImpl(root, rawEncoder.beginComputePass(rawDescriptor), encoder);
}

/**
 * Wraps a raw compute pass encoder the user owns, so that dispatches recorded
 * into it take the same route as dispatches into a TypeGPU pass. The state is
 * marked as raw-accessed, since the encoder can be mutated behind our back at
 * any point.
 */
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
      lastApplied: undefined,
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
    const { state } = this[$internal];
    state.currentPipeline = pipeline;
    state.version++;
  }

  setBindGroup<Entries extends Record<string, TgpuLayoutEntry | null>>(
    first: TgpuBindGroup | TgpuBindGroupLayout<Entries>,
    bindGroup?: TgpuBindGroup<Entries> | GPUBindGroup,
  ): void {
    const { state } = this[$internal];
    if (isBindGroup(first)) {
      state.bindGroups.set(first.layout, first);
    } else {
      state.bindGroups.set(first as TgpuBindGroupLayout, bindGroup as TgpuBindGroup | GPUBindGroup);
    }
    state.version++;
  }

  dispatchWorkgroups(x: number, y?: number, z?: number): void {
    this.#emit((rawPass) => rawPass.dispatchWorkgroups(x, y, z));
  }

  dispatchWorkgroupsIndirect(indirectBuffer: GPUBuffer, indirectOffset: GPUSize64): void {
    this.#emit((rawPass) => rawPass.dispatchWorkgroupsIndirect(indirectBuffer, indirectOffset));
  }

  end(): void {
    this[$internal].rawPass.end();
  }
}
