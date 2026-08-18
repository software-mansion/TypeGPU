import type {
  TgpuBindGroup,
  TgpuBindGroupLayout,
  TgpuCommandEncoder,
  TgpuComputePass,
  TgpuComputePipeline,
} from 'typegpu';

export type DepthComputePass = GPUComputePassEncoder | TgpuComputePass;

interface EncoderRunOptions {
  /** Records one compute pass on this encoder without submitting it. */
  encoder: GPUCommandEncoder | TgpuCommandEncoder;
  pass?: never;
}

interface PassRunOptions {
  encoder?: never;
  /** Records into this pass without ending or submitting it. */
  pass: DepthComputePass;
}

/** Controls where inference dispatches are recorded. Defaults to one standalone submission. */
export type DepthRunOptions = EncoderRunOptions | PassRunOptions;

export interface Workgroups {
  readonly x: number;
  readonly y?: number;
  readonly z?: number;
}

/** Raw groups are used for aligned sub-ranges of the shared immutable weight buffer. */
export interface PreparedRawBindGroup {
  readonly layout: TgpuBindGroupLayout;
  readonly bindGroup: GPUBindGroup;
}

export type PreparedBindGroup = TgpuBindGroup | PreparedRawBindGroup;

/** A fully prepared dispatch. Every stable resource must already be bound. */
export interface PreparedDispatch {
  readonly pipeline: TgpuComputePipeline;
  readonly bindGroups: readonly PreparedBindGroup[];
  readonly workgroups: Workgroups;
  readonly label?: string;
}

export interface OwnedGpuResource {
  destroy(): void;
}

function recordDispatch(pass: DepthComputePass, dispatch: PreparedDispatch): void {
  let bound = dispatch.pipeline.with(pass as TgpuComputePass);
  for (const bindGroup of dispatch.bindGroups) {
    bound =
      'bindGroup' in bindGroup
        ? bound.with(bindGroup.layout, bindGroup.bindGroup)
        : bound.with(bindGroup);
  }
  bound.dispatchWorkgroups(
    dispatch.workgroups.x,
    dispatch.workgroups.y ?? 1,
    dispatch.workgroups.z ?? 1,
  );
}

/**
 * Prepared, repeatable dispatch sequence shared by the full model and small test graphs.
 * No resource or bind-group creation occurs in `encode` or `run`.
 */
export class PreparedDispatchSequence {
  readonly #dispatches: readonly PreparedDispatch[];
  readonly #pipelines: readonly TgpuComputePipeline[];
  readonly #ownedResources: readonly OwnedGpuResource[];
  #destroyed = false;

  constructor(
    dispatches: readonly PreparedDispatch[],
    ownedResources: readonly OwnedGpuResource[],
  ) {
    this.#dispatches = dispatches;
    this.#pipelines = [...new Set(dispatches.map((dispatch) => dispatch.pipeline))];
    this.#ownedResources = [...new Set(ownedResources)];
  }

  get dispatchCount(): number {
    return this.#dispatches.length;
  }

  get pipelineCount(): number {
    return this.#pipelines.length;
  }

  initSync(): void {
    this.#assertAlive();
    for (const pipeline of this.#pipelines) {
      pipeline.initSync();
    }
  }

  async initAsync(): Promise<void> {
    this.#assertAlive();
    await Promise.all(this.#pipelines.map((pipeline) => pipeline.initAsync()));
  }

  encode(pass: DepthComputePass): void {
    this.#assertAlive();
    for (const dispatch of this.#dispatches) {
      recordDispatch(pass, dispatch);
    }
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    for (const resource of this.#ownedResources) {
      resource.destroy();
    }
  }

  #assertAlive(): void {
    if (this.#destroyed) {
      throw new Error('Depth inference plan has been destroyed.');
    }
  }
}
