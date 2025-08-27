import { builtin } from './builtin.ts';
import { computeFn } from './core/function/tgpuComputeFn.ts';
import { fn } from './core/function/tgpuFn.ts';
import type { TgpuRoot } from './core/root/rootTypes.ts';
import { u32 } from './data/numeric.ts';
import { vec3f, vec3u } from './data/vector.ts';
import type { v3u } from './data/wgslTypes.ts';
import { any, ge } from './std/boolean.ts';
import { ceil } from './std/numeric.ts';

/**
 * Changes the given array to a vec of 3 numbers, filling missing values with 1.
 */
function toVec3(arr: readonly number[]): v3u {
  if (arr.includes(0)) {
    throw new Error('Size and workgroupSize cannot contain zeroes.');
  }
  return vec3u(arr[0] ?? 1, arr[1] ?? 1, arr[2] ?? 1);
}

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
export function prepareDispatch(options: {
  root: TgpuRoot;
  callback: (x: number) => void;
  size: readonly [number];
  workgroupSize?: readonly [number];
}): () => Promise<undefined>;
export function prepareDispatch(options: {
  root: TgpuRoot;
  callback: (x: number, y: number) => void;
  size: readonly [number, number];
  workgroupSize?: readonly [number, number];
}): () => Promise<undefined>;
export function prepareDispatch(options: {
  root: TgpuRoot;
  callback: (x: number, y: number, z: number) => void;
  size: readonly [number, number, number];
  workgroupSize?: readonly [number, number, number];
}): () => Promise<undefined>;
export function prepareDispatch(options: {
  root: TgpuRoot;
  callback: (x: number, y: number, z: number) => void;
  size: readonly number[];
  workgroupSize?: readonly number[];
}): () => Promise<undefined> {
  const size = toVec3(options.size);
  const workgroupSize = toVec3(options.workgroupSize ?? []);
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
