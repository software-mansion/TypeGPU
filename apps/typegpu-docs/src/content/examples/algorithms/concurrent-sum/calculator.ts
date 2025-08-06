import { concurrentSum } from '@typegpu/concurrent-sum';
import { compareArrayWithBuffer, concurrentSumOnJS } from './utils.ts';
import * as d from 'typegpu/data';
import type { TgpuRoot } from 'typegpu';
import * as std from 'typegpu/std';

type SumResult = {
  success: boolean;
  arraySize: number;
  error?: string;
  jsTime?: number;
  gpuTime?: number;
  speedup?: number;
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
  const calcResult = concurrentSum(
    root,
    inputBuffer,
    std.add,
    0,
  );

  const gpuTime = performance.now() - gpuStartTime;
  root['~unstable'].flush();

  // Compare results
  const gpuResult = await calcResult.read();
  console.log(`GPU result: ${gpuResult}`);
  const isEqual = compareArrayWithBuffer(jsResult, gpuResult);
  if (!isEqual) {
    console.error(`Mismatch detected for array size ${arraySize}`);
    return {
      success: false,
      error:
        `Mismatch detected for array size ${arraySize}. Expected final sum: ${
          jsResult[jsResult.length - 1]
        }`,
      arraySize,
      jsTime,
      gpuTime,
    };
  }

  return {
    success: true,
    arraySize,
    jsTime,
    gpuTime,
    speedup: jsTime / gpuTime,
    expectedSum: jsResult[jsResult.length - 1],
  };
}
