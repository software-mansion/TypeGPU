import { builtin } from './builtin.ts';
import { computeFn } from './core/function/tgpuComputeFn.ts';
import { fn } from './core/function/tgpuFn.ts';
import type { TgpuRoot } from './core/root/rootTypes.ts';
import { u32 } from './data/numeric.ts';
import { vec3f, vec3u } from './data/vector.ts';
import { v3u } from './data/wgslTypes.ts';
import { any, ge } from './std/boolean.ts';
import { ceil } from './std/numeric.ts';

const workgroupSizeConfigs = [
  vec3u(1, 1, 1),
  vec3u(256, 1, 1),
  vec3u(16, 16, 1),
  vec3u(8, 8, 4),
] as const;

/**
 * Changes the given array to a vec of 3 numbers, filling missing values with 1.
 */
function toVec3(arr: readonly (number | undefined)[]): v3u {
  if (arr.includes(0)) {
    throw new Error('Size and workgroupSize cannot contain zeroes.');
  }
  return vec3u(arr[0] ?? 1, arr[1] ?? 1, arr[2] ?? 1);
}

type DispatchForArgs<TArgs> = TArgs extends { length: infer TLength }
  ? TLength extends 0 ? (() => Promise<undefined>)
  : TLength extends 1 ? ((x: number) => Promise<undefined>)
  : TLength extends 2 ? ((x: number, y: number) => Promise<undefined>)
  : TLength extends 3
    ? ((x: number, y: number, z: number) => Promise<undefined>)
  : never
  : never;

/**
 * Creates a dispatch function for a compute pipeline.
 *
 * The returned function can be called multiple times to run GPU computations.
 * It returns a promise that resolves when the device queue completes its work.
 *
 * @param options.root A TgpuRoot instance.
 * @param options.callback A function converted to WGSL and executed on the GPU. Its arguments correspond to the global invocation IDs.
 * @param options.size A 3D (or shorter) array specifying the total number of threads to run.
 * @param options.workgroupSize (optional) A 3D (or shorter) array specifying the workgroup dimensions. Defaults to [1, 1, 1].
 *
 * The callback is not invoked for any invocation IDs that exceed `options.size`.
 */
export function prepareDispatch<TArgs extends number[]>(
  root: TgpuRoot,
  callback: (...args: TArgs) => undefined,
): DispatchForArgs<TArgs> {
  const workgroupSize = workgroupSizeConfigs[callback.length] as v3u;
  const wrappedCallback = fn([u32, u32, u32])(
    callback as (...args: number[]) => void,
  );

  const sizeMutable = root.createMutable(vec3u);

  const mainCompute = computeFn({
    workgroupSize: workgroupSize,
    in: { id: builtin.globalInvocationId },
  })(({ id }) => {
    'kernel';
    if (any(ge(id, sizeMutable.$))) {
      return;
    }
    wrappedCallback(id.x, id.y, id.z);
  });

  const pipeline = root['~unstable']
    .withCompute(mainCompute)
    .createPipeline();

  return ((...size: (number | undefined)[]) => {
    const sanitizedSize = toVec3(size);
    const workgroupCount = ceil(vec3f(sanitizedSize).div(vec3f(workgroupSize)));
    sizeMutable.write(sanitizedSize);
    pipeline.dispatchWorkgroups(
      workgroupCount.x,
      workgroupCount.y,
      workgroupCount.z,
    );
    root['~unstable'].flush();
    return root.device.queue.onSubmittedWorkDone();
  }) as DispatchForArgs<TArgs>;
}
