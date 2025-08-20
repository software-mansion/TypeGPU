import {
  initCache,
  prefixScan,
} from '../../../../../../../packages/typegpu-concurrent-scan/src/index.ts';
import { compareArrayWithBuffer, concurrentSumOnJS } from './utils.ts';
import * as d from 'typegpu/data';
import type { TgpuRoot } from 'typegpu';
import * as std from 'typegpu/std';

type SumResult = {
  success: boolean;
  jsTime?: number;
  gpuTime?: number;
  gpuShaderTime?: number;
};

export async function performCalculationsWithTime(
  root: TgpuRoot,
  inputArray: number[],
): Promise<SumResult> {
  const arraySize = inputArray.length;
  const inputBuffer = root
    .createBuffer(
      d.arrayOf(d.f32, arraySize),
    )
    .$usage('storage');
  inputBuffer.write(inputArray);

  // JS Version
  const jsStartTime = performance.now();
  const jsResult = concurrentSumOnJS(inputArray);
  const jsTime = performance.now() - jsStartTime;

  // GPU Version
  initCache(root, { operation: std.add, identityElement: 0 }, true);
  const gpuStartTime = performance.now();
  let timestampPromise: Promise<bigint[]> = Promise.resolve([]);
  const calcResult = prefixScan(
    root,
    inputBuffer,
    { operation: std.add, identityElement: 0 },
    (timeTgpuQuery) => {
      timestampPromise = timeTgpuQuery.read();
    },
  );
  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();
  const gpuTime = performance.now() - gpuStartTime;
  // Compare results
  const gpuResult = await calcResult.read();
  const timestamps = await timestampPromise;
  const gpuShaderTime = Number(timestamps[1] - timestamps[0]) / 1_000_000;
  const isEqual = compareArrayWithBuffer(jsResult, gpuResult);
  return {
    success: isEqual,
    jsTime,
    gpuTime,
    gpuShaderTime,
  };
}
