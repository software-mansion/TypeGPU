import type { BaseData } from '../../data/wgslTypes.ts';
import { getResolutionCtx, provideCtx } from '../../execMode.ts';
import { ResolutionCtxImpl } from '../../resolutionCtx.ts';
import wgslGenerator from '../../tgsl/wgslGenerator.ts';
import { SimulationState } from '../../types.ts';
import type { TgpuBuffer } from '../buffer/buffer.ts';
import { namespace } from '../resolve/namespace.ts';
import type { TgpuVar } from '../variable/tgpuVariable.ts';

interface SimulationResult<T> {
  value: T;

  buffers: Map<TgpuBuffer<BaseData>, unknown>;
  privateVars: Map<TgpuVar<'private'>, unknown>[][][];
  workgroupVars: Map<TgpuVar<'workgroup'>, unknown>[][][];
}

/**
 * Runs the provided callback in a simulated environment, giving
 * it access to buffers and variables as if it were running on the GPU.
 *
 * The result of the simulation is returned, and does not affect the actual GPU state,
 * nor does it carry over to other simulations.
 *
 * @param callback The callback to run in the simulated environment.
 * @returns An object containing the result of the simulation, and
 *          the final state of the environment.
 *
 * @example
 * const counter = tgpu.privateVar(d.u32);
 *
 * const result = tgpu.simulate(() => {
 *  counter.$ += 1;
 *  counter.$ += 2;
 *  return counter.$;
 * });
 *
 * console.log(result.value); // 3
 */
export function simulate<T>(callback: () => T): SimulationResult<T> {
  // We could already be inside a resolution context, for example
  // during lazy computation, where users would like to precompute
  // something that happens to require simulation.
  const ctx = getResolutionCtx() ?? new ResolutionCtxImpl({
    // Not relevant
    namespace: namespace(),
    shaderGenerator: wgslGenerator,
  });

  // Statically locked to one "thread" for now
  const workgroups: readonly [number, number, number] = [1, 1, 1];
  const workgroupSize: readonly [number, number, number] = [1, 1, 1];
  const threads = [
    workgroups[0] * workgroupSize[0],
    workgroups[1] * workgroupSize[1],
    workgroups[2] * workgroupSize[2],
  ] as const;

  const buffers = new Map<TgpuBuffer<BaseData>, unknown>();

  const workgroupVars = Array.from(
    { length: workgroups[0] },
    () =>
      Array.from(
        { length: workgroups[1] },
        () => Array.from({ length: workgroups[2] }, () => new Map()),
      ),
  );

  const privateVars = Array.from(
    { length: threads[0] },
    () =>
      Array.from(
        { length: threads[1] },
        () => Array.from({ length: threads[2] }, () => new Map()),
      ),
  );

  const simStates = Array.from(
    { length: threads[0] },
    (_, i) =>
      Array.from(
        { length: threads[1] },
        (_, j) =>
          Array.from({ length: threads[2] }, (_, k) => {
            const wi = Math.floor(i / workgroupSize[0]);
            const wj = Math.floor(j / workgroupSize[1]);
            const wk = Math.floor(k / workgroupSize[2]);
            return new SimulationState(buffers, {
              // oxlint-disable-next-line typescript/no-non-null-assertion -- it's there, trust me
              private: privateVars[i]![j]![k]!,
              // oxlint-disable-next-line typescript/no-non-null-assertion -- it's there, trust me
              workgroup: workgroupVars[wi]![wj]![wk]!,
            });
          }),
      ),
  );

  // oxlint-disable-next-line typescript/no-non-null-assertion -- it's there, trust me
  ctx.pushMode(simStates[0]![0]![0]!);
  try {
    const value = provideCtx(ctx, callback);
    return {
      value,
      buffers,
      privateVars,
      workgroupVars,
    };
  } finally {
    ctx.popMode('simulate');
  }
}
