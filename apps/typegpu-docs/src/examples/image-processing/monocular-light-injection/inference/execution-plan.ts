import type { TgpuBindGroup, TgpuComputePass, TgpuComputePipeline } from 'typegpu';

export interface Workgroups {
  readonly x: number;
  readonly y?: number;
  readonly z?: number;
}

/** A fully prepared dispatch. Every stable resource must already be bound */
export interface PreparedDispatch {
  readonly pipeline: TgpuComputePipeline;
  readonly bindGroup: TgpuBindGroup;
  readonly workgroups: Workgroups;
}

export interface OwnedGpuResource {
  destroy(): void;
}

export function recordDispatch(pass: TgpuComputePass, dispatch: PreparedDispatch): void {
  dispatch.pipeline
    .with(pass)
    .with(dispatch.bindGroup)
    .dispatchWorkgroups(
      dispatch.workgroups.x,
      dispatch.workgroups.y ?? 1,
      dispatch.workgroups.z ?? 1,
    );
}
