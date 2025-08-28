import { builtin } from './builtin.ts';
import { computeFn } from './core/function/tgpuComputeFn.ts';
import { fn } from './core/function/tgpuFn.ts';
import type { TgpuRoot } from './core/root/rootTypes.ts';
import { u32 } from './data/numeric.ts';
import { vec3f, vec3u } from './data/vector.ts';
import type { v3u } from './data/wgslTypes.ts';
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
 * @param root A TgpuRoot instance.
 * @param callback A function converted to WGSL and executed on the GPU. Its arguments correspond to the global invocation IDs.
 */
export function prepareDispatch<TArgs extends number[]>(
  root: TgpuRoot,
  callback: (...args: TArgs) => undefined,
): DispatchForArgs<TArgs> {
  if (callback.length >= 4) {
    throw new Error('Dispatch only supports up to three dimensions.');
  }
  const workgroupSize = workgroupSizeConfigs[callback.length] as v3u;
  const wrappedCallback = fn([u32, u32, u32])(
    callback as (...args: number[]) => void,
  );

  const sizeUniform = root.createUniform(vec3u);

  // raw WGSL instead of TGSL
  // because we do not run unplugin before shipping typegpu package
  const mainCompute = computeFn({
    workgroupSize: workgroupSize,
    in: { id: builtin.globalInvocationId },
  })`{
    if (any(in.id >= sizeUniform)) {
      return;
    }
    wrappedCallback(in.id.x, in.id.y, in.id.z);
  }`.$uses({ sizeUniform, wrappedCallback });

  const pipeline = root['~unstable']
    .withCompute(mainCompute)
    .createPipeline();

  return ((...size: (number | undefined)[]) => {
    const sanitizedSize = toVec3(size);
    const workgroupCount = ceil(vec3f(sanitizedSize).div(vec3f(workgroupSize)));
    sizeUniform.write(sanitizedSize);
    pipeline.dispatchWorkgroups(
      workgroupCount.x,
      workgroupCount.y,
      workgroupCount.z,
    );
    root['~unstable'].flush();
    return root.device.queue.onSubmittedWorkDone();
  }) as DispatchForArgs<TArgs>;
}
