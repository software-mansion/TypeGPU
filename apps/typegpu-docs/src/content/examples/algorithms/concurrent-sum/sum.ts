import { currentSum } from '@typegpu/concurrent-sum';
import { compareArrayWithBuffer, concurrentSumOnJS } from './utils.ts';
import * as d from 'typegpu/data';
import type { TgpuRoot } from 'typegpu';
import * as std from 'typegpu/std';

export async function sumWithTime(
  root: TgpuRoot,
  inputArray: number[],
  results: HTMLDivElement,
) {
  const arraySize = inputArray.length;
  const sizeBuffer = root
    .createBuffer(
      d.arrayOf(d.u32, arraySize),
    )
    .$usage('storage');
  sizeBuffer.write(inputArray);

  // JS Version
  const jsStartTime = performance.now();
  const jsArray = Array.from({ length: arraySize }, () => 1);
  const jsResult = concurrentSumOnJS(jsArray);
  const jsEndTime = performance.now();
  const jsTime = jsEndTime - jsStartTime;

  // GPU Version
  const gpuStartTime = performance.now();
  const sumResult = await currentSum(
    root,
    sizeBuffer,
    std.add,
    undefined,
    async (timeTgpuQuery) => {
      const timestamps = await timeTgpuQuery.read();
      const timeNs = timestamps[1] - timestamps[0];
      results.innerHTML += `<strong>GPU time for currentSum: ${
        (Number(timeNs) / 1000000).toFixed(2)
      } ms</strong><br>`;
    },
  );

  // TODO: plain ugly, refactor this //remove
  if (!sumResult) {
    console.error(`Failed to execute currentSum for array size ${arraySize}`);
    results.innerHTML +=
      `<strong>Error:</strong> Failed to execute currentSum for array size ${arraySize}.<br>`;
    return;
  }
  const gpuEndTime = performance.now();
  const gpuResult = await sumResult.read();
  const gpuTime = gpuEndTime - gpuStartTime;
  root['~unstable'].flush();
  const isEqual = compareArrayWithBuffer(jsResult, gpuResult);
  if (!isEqual) {
    console.error(`Mismatch detected for array size ${arraySize}`);
    results.innerHTML +=
      `<strong>Error:</strong> Mismatch detected for array size ${arraySize}. Expected final sum: ${
        jsResult[jsResult.length - 1]
      }. Check console for details.<br>`;
    return;
  }

  const resultElement = document.createElement('div');
  resultElement.innerHTML = `
      <strong>Array size: ${arraySize.toLocaleString()}</strong><br>
      JS time: ${jsTime.toFixed(2)}ms<br>
      GPU time: ${gpuTime.toFixed(2)}ms<br>
      Speedup: ${(jsTime / gpuTime).toFixed(2)}x<br>
    `;
  results.appendChild(resultElement);
}
