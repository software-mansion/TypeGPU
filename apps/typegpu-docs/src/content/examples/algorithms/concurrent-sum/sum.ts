import { currentSum } from '@typegpu/concurrent-sum';
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
  gpuInternalTime?: number;
  speedup?: number;
  expectedSum?: number;
};

export async function performCalculationsWithTime(
  root: TgpuRoot,
  inputArray: number[],
): Promise<SumResult> {
  const arraySize = inputArray.length;
  const sizeBuffer = root
    .createBuffer(
      d.arrayOf(d.u32, arraySize),
    )
    .$usage('storage');
  sizeBuffer.write(inputArray);

  // JS Version
  const jsStartTime = performance.now();
  const jsResult = concurrentSumOnJS(inputArray);
  const jsTime = performance.now() - jsStartTime;

  // GPU Version
  const gpuStartTime = performance.now();
  let gpuInternalTime: number | undefined;

  const sumResult = await currentSum(
    root,
    sizeBuffer,
    std.add,
    0,
    undefined,
    async (timeTgpuQuery) => {
      const timestamps = await timeTgpuQuery.read();
      const timeNs = timestamps[1] - timestamps[0];
      gpuInternalTime = Number(timeNs) / 1000000;
    },
  );

  if (!sumResult) {
    console.error(`Failed to execute currentSum for array size ${arraySize}`);
    return {
      success: false,
      error: `Failed to execute currentSum for array size ${arraySize}`,
      arraySize,
    };
  }

  const gpuTime = performance.now() - gpuStartTime;
  const gpuResult = await sumResult.read();
  root['~unstable'].flush();

  // Compare results
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
      gpuInternalTime,
    };
  }

  return {
    success: true,
    arraySize,
    jsTime,
    gpuTime,
    gpuInternalTime,
    speedup: jsTime / gpuTime,
    expectedSum: jsResult[jsResult.length - 1],
  };
}
