import { concurrentScan } from '@typegpu/concurrent-sum';
import { compareArrayWithBuffer, concurrentSumOnJS } from './utils.ts';
import * as d from 'typegpu/data';
import type { TgpuRoot } from 'typegpu';
import * as std from 'typegpu/std';

type SumResult = {
  success: boolean;
  jsTime?: number;
  gpuTime?: number;
  gpuShaderTime?: number;
  expectedSum?: number;
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
  console.log('Starting GPU calculations...');
  const gpuStartTime = performance.now();
  let resolveTime: ((value: number) => void) | undefined;
  const timePromise = new Promise<number>((resolve, reject) => {
    resolveTime = resolve;
  });
  const calcResult = concurrentScan(
    root,
    inputBuffer,
    std.add,
    0,
    false,
    async (timeTgpuQuery) => {
      const timestamps = await timeTgpuQuery.read();
      const timeNs = timestamps[1] - timestamps[0];
      const gpuShaderTime = Number(timeNs) / 1000000;
      if (resolveTime) resolveTime(gpuShaderTime);
    },
  );

  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();
  const gpuTime = performance.now() - gpuStartTime;

  // Compare results
  const gpuResult = await calcResult.read();
  const gpuShaderTime = await timePromise;
  console.log(`GPU shader time: ${gpuShaderTime}ms`);
  // console.log(`GPU result: ${gpuResult}`);
  const isEqual = compareArrayWithBuffer(jsResult, gpuResult);
  console.log(gpuTime, gpuShaderTime, jsTime);
  if (!isEqual) {
    return {
      success: false,
      jsTime,
      gpuTime,
      gpuShaderTime,
    };
  }

  return {
    success: true,
    jsTime,
    gpuTime,
    gpuShaderTime,
    expectedSum: jsResult[jsResult.length - 1],
  };
}
