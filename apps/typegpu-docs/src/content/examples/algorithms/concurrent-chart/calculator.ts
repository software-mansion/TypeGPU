import { concurrentScan } from '@typegpu/concurrent-sum';
import { compareArrayWithBuffer, concurrentSumOnJS } from './utils.ts';
import * as d from 'typegpu/data';
import type { TgpuRoot } from 'typegpu';
import * as std from 'typegpu/std';

type SumResult = {
  success: boolean;
  jsTime?: number;
  gpuTime?: number;
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
  const gpuStartTime = performance.now();
  const calcResult = concurrentScan(
    root,
    inputBuffer,
    std.add,
    0,
    false,
  );

  root['~unstable'].flush();
  await root.device.queue.onSubmittedWorkDone();
  const gpuTime = performance.now() - gpuStartTime;

  // Compare results
  const gpuResult = await calcResult.read();
  // console.log(`GPU result: ${gpuResult}`);
  const isEqual = compareArrayWithBuffer(jsResult, gpuResult);
  if (!isEqual) {
    return {
      success: false,
      jsTime,
      gpuTime,
    };
  }

  return {
    success: true,
    jsTime,
    gpuTime,
    expectedSum: jsResult[jsResult.length - 1],
  };
}
