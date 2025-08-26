import { builtin } from './builtin.ts';
import { computeFn } from './core/function/tgpuComputeFn.ts';
import { fn } from './core/function/tgpuFn.ts';
import type { TgpuRoot } from './core/root/rootTypes.ts';
import { u32 } from './data/numeric.ts';
import { vec3f, vec3u } from './data/vector.ts';
import { v3u } from './data/wgslTypes.ts';
import { any, ge } from './std/boolean.ts';
import { ceil } from './std/numeric.ts';

/**
 * Changes the given array to a vec of 3 numbers, filling missing values with 1.
 */
function sanitizeArray(arr: readonly number[]): v3u {
  return vec3u(arr[0] ?? 1, arr[1] ?? 1, arr[2] ?? 1);
}

/**
 * Create a dispatch function for a compute pipeline.
 * Call the returned dispatch function to run the GPU computations.
 * The returned dispatch function can be called multiple times.
 * The returned dispatch function returns a promise that resolves when the device queue finishes its jobs.
 * @param options.root A TgpuRoot.
 * @param options.callback A function that is parsed to WGSL and run on GPU. Its arguments are the global invocation ids of the call.
 * @param options.size A 3d (or shorter) array holding the total number of threads to run.
 * @param options.workgroupSize (optional) A 3d (or shorter) array holding the sizes of the groups of threads.
 * [1, 1, 1] by default. Setting this to bigger values might speed up the computation due to better caching.
 * The callback is not called when the gid would exceed option.size.
 */
export function prepareDispatch(options: {
  root: TgpuRoot;
  size: readonly [number];
  callback: (x: number) => void;
  workgroupSize?: readonly [number];
}): () => Promise<undefined>;
export function prepareDispatch(options: {
  root: TgpuRoot;
  size: readonly [number, number];
  callback: (x: number, y: number) => void;
  workgroupSize?: readonly [number, number];
}): () => Promise<undefined>;
export function prepareDispatch(options: {
  root: TgpuRoot;
  size: readonly [number, number, number];
  callback: (x: number, y: number, z: number) => void;
  workgroupSize?: readonly [number, number, number];
}): () => Promise<undefined>;
export function prepareDispatch(options: {
  root: TgpuRoot;
  size: readonly number[];
  callback: (x: number, y: number, z: number) => void;
  workgroupSize?: readonly number[];
}): () => Promise<undefined> {
  const size = sanitizeArray(options.size);
  const workgroupSize = sanitizeArray(options.workgroupSize ?? []);
  const workgroupCount = ceil(vec3f(size).div(vec3f(workgroupSize)));

  const wrappedCallback = fn([u32, u32, u32])(options.callback);

  const mainCompute = computeFn({
    workgroupSize: workgroupSize,
    in: { id: builtin.globalInvocationId },
  })(({ id }) => {
    'kernel';
    if (any(ge(id, size))) {
      return;
    }
    wrappedCallback(id.x, id.y, id.z);
  });

  const pipeline = options.root['~unstable']
    .withCompute(mainCompute)
    .createPipeline();

  return () => {
    pipeline.dispatchWorkgroups(
      workgroupCount.x,
      workgroupCount.y,
      workgroupCount.z,
    );
    options.root['~unstable'].flush();
    return options.root.device.queue.onSubmittedWorkDone();
  };
}
