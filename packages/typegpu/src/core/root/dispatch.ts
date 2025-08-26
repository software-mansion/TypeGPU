import { builtin } from '../../builtin.ts';
import { u32 } from '../../data/numeric.ts';
import { vec3f, vec3u } from '../../data/vector.ts';
import { v3u } from '../../data/wgslTypes.ts';
import { any, ge } from '../../std/boolean.ts';
import { ceil } from '../../std/numeric.ts';
import { computeFn } from '../function/tgpuComputeFn.ts';
import { fn } from '../function/tgpuFn.ts';
import type { TgpuRoot } from './rootTypes.ts';

/**
 * Changes the given array to a vec of 3 numbers, filling missing values with 1.
 */
function sanitizeArray(arr: readonly number[]): v3u {
  return vec3u(arr[0] ?? 1, arr[1] ?? 1, arr[2] ?? 1);
}

/**
 * Dispatch a single-shot compute pipeline.
 * @param options.root A TgpuRoot.
 * @param options.callback A function that is parsed to WGSL and run on GPU. Its arguments are the global invocation ids of the call.
 * @param options.size A 3d (or shorter) array holding the total number of threads to run.
 * @param options.workgroupSize (optional) A 3d (or shorter) array holding the sizes of the workgroups. [1, 1, 1] by default.
 */
export function dispatch(options: {
  root: TgpuRoot;
  size: readonly [number];
  callback: (x: number) => void;
  workgroupSize?: readonly [number];
}): void;
export function dispatch(options: {
  root: TgpuRoot;
  size: readonly [number, number];
  callback: (x: number, y: number) => void;
  workgroupSize?: readonly [number, number];
}): void;
export function dispatch(options: {
  root: TgpuRoot;
  size: readonly [number, number, number];
  callback: (x: number, y: number, z: number) => void;
  workgroupSize?: readonly [number, number, number];
}): void;
export function dispatch(options: {
  root: TgpuRoot;
  size: readonly number[];
  callback: (x: number, y: number, z: number) => void;
  workgroupSize?: readonly number[];
}): void {
  const checkedSize = sanitizeArray(options.size);
  const checkedWorkgroupSize = sanitizeArray(options.workgroupSize ?? []);
  const workgroupCount = ceil(
    vec3f(checkedSize).div(vec3f(checkedWorkgroupSize)),
  );

  const wrappedCallback = fn([u32, u32, u32])(options.callback);

  const mainCompute = computeFn({
    workgroupSize: checkedWorkgroupSize,
    in: { id: builtin.globalInvocationId },
  })(({ id }) => {
    'kernel';
    if (any(ge(id, checkedSize))) {
      return;
    }
    wrappedCallback(id.x, id.y, id.z);
  });

  options.root['~unstable']
    .withCompute(mainCompute)
    .createPipeline()
    .dispatchWorkgroups(workgroupCount.x, workgroupCount.y, workgroupCount.z);
}
