import { initCache, prefixScan } from '@typegpu/concurrent-scan';
import type { TgpuRoot } from 'typegpu';
import { d, std } from 'typegpu';

type SumResult = {
  success: boolean;
  jsTime: number;
  gpuTime: number;
  gpuShaderTime: number;
};

function prefixSumOnJS(arr: number[]) {
  for (let i = 1; i < arr.length; i++) {
    arr[i] += arr[i - 1];
  }
  // In Blelloch scan, the result starts with identity element
  arr.unshift(0);
  arr.pop();
  return arr;
}

function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

export async function performCalculationsWithTime(
  root: TgpuRoot,
  inputArray: number[],
): Promise<SumResult> {
  const arraySize = inputArray.length;
  const inputBuffer = root
    .createBuffer(d.arrayOf(d.f32, arraySize))
    .$usage('storage');
  inputBuffer.write(inputArray);

  // JS version
  const jsStartTime = performance.now();
  const jsResult = prefixSumOnJS(inputArray);
  const jsTime = performance.now() - jsStartTime;

  // GPU version
  initCache(root, { operation: std.add, identityElement: 0 });
  const querySet = root.createQuerySet('timestamp', 2);
  const gpuStartTime = performance.now();
  const calcResult = prefixScan(
    root,
    {
      inputBuffer: inputBuffer,
      outputBuffer: inputBuffer,
      operation: std.add,
      identityElement: 0,
    },
    querySet,
  );
  querySet.resolve();
  await root.device.queue.onSubmittedWorkDone();
  const gpuTime = performance.now() - gpuStartTime;

  const gpuResult = await calcResult.read();
  const timestamps = await querySet.read();
  const gpuShaderTime = Number(timestamps[1] - timestamps[0]) / 1_000_000;

  return {
    success: arraysEqual(jsResult, gpuResult),
    jsTime,
    gpuTime,
    gpuShaderTime,
  };
}
