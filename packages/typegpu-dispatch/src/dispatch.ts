import tgpu, { TgpuRoot } from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

/**
 * Changes the given array to an array of 3 numbers, filling missing values with 1.
 */
function sanitizeArray(arr: readonly number[]): [number, number, number] {
  return [1, 1, 1]
    .map((elem, i) => arr?.[i] ?? elem) as [number, number, number];
}

/**
 * Dispatch a single-shot compute pipeline.
 * @param root A TgpuRoot.
 * @param size A 3d (or shorter) array holding the total number of threads to run.
 * @param callback A function that is parsed to WGSL and run on GPU. It's arguments are the global invocation ids of the call.
 * @param workgroupSize (optional) A 3d (or shorter) array holding the sizes of the workgroups. [1, 1, 1] by default.
 */
export function dispatch(
  root: TgpuRoot,
  size: readonly [number],
  callback: (x: number) => void,
  workgroupSize?: readonly [number],
): void;
export function dispatch(
  root: TgpuRoot,
  size: readonly [number, number],
  callback: (x: number, y: number) => void,
  workgroupSize?: readonly [number, number],
): void;
export function dispatch(
  root: TgpuRoot,
  size: readonly [number, number, number],
  callback: (x: number, y: number, z: number) => void,
  workgroupSize?: readonly [number, number, number],
): void;
export function dispatch(
  root: TgpuRoot,
  size: readonly number[],
  callback: (x: number, y: number, z: number) => void,
  workgroupSize?: readonly number[],
): void {
  const checkedSize = sanitizeArray(size);
  const checkedSizeVec = d.vec3u(...checkedSize);
  const checkedWorkgroupSize = sanitizeArray(workgroupSize ?? []);
  const workgroupCount = [
    Math.ceil(checkedSize[0] / checkedWorkgroupSize[0]),
    Math.ceil(checkedSize[1] / checkedWorkgroupSize[1]),
    Math.ceil(checkedSize[2] / checkedWorkgroupSize[2]),
  ] as const;

  const wrappedCallback = tgpu.fn([d.u32, d.u32, d.u32])(callback);

  const mainCompute = tgpu['~unstable'].computeFn({
    workgroupSize: checkedWorkgroupSize,
    in: { id: d.builtin.globalInvocationId },
  })(({ id }) => {
    if (std.any(std.ge(id, d.vec3u(checkedSizeVec)))) {
      return;
    }
    wrappedCallback(id.x, id.y, id.z);
  });

  root['~unstable']
    .withCompute(mainCompute)
    .createPipeline()
    .dispatchWorkgroups(...workgroupCount);
}
