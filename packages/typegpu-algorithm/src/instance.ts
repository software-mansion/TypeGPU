import type { TgpuComputePass, TgpuComputePipeline } from 'typegpu';

/** A compute pass a module's `step` records into */
export type ComputePass = TgpuComputePass | GPUComputePassEncoder;

export interface Dispatch {
  pipeline: TgpuComputePipeline;
  workgroups: [number, number, number];
}

export function dispatchAll(pass: ComputePass, dispatches: readonly Dispatch[]): void {
  for (const { pipeline, workgroups } of dispatches) {
    pipeline.with(pass as TgpuComputePass).dispatchWorkgroups(...workgroups);
  }
}

export function initPipelinesSync(pipelines: Iterable<TgpuComputePipeline>): void {
  for (const pipeline of new Set(pipelines)) {
    pipeline.initSync();
  }
}

export async function initPipelinesAsync(pipelines: Iterable<TgpuComputePipeline>): Promise<void> {
  await Promise.all([...new Set(pipelines)].map((pipeline) => pipeline.initAsync()));
}

/**
 * Tracks whether an instance was destroyed. `destroy` frees `owned` once, every later call is a
 * no-op, and `assertAlive` throws an error naming the module.
 */
export function createLifecycle(moduleName: string, owned: { destroy(): void }[]) {
  let destroyed = false;

  return {
    assertAlive: (method: string): void => {
      if (destroyed) {
        throw new Error(`${moduleName}: cannot call ${method}() after destroy().`);
      }
    },

    destroy: (): void => {
      if (destroyed) {
        return;
      }
      destroyed = true;
      for (const resource of owned) {
        resource.destroy();
      }
    },
  };
}
