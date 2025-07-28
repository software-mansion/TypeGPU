import { currentSum } from '@typegpu/concurrent-sum';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const fixedArrayLength = 2 ** 16;

const root = await tgpu.init({
  device: {
    requiredFeatures: [
      'timestamp-query',
    ],
  },
});
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const button = document.querySelector('#runButton') as HTMLButtonElement;

button.addEventListener('click', async () => {
  button.disabled = true;

  const arraySizes = [6092137, 2 ** 20, 2 ** 22];
  // const arraySizes = [2**12];
  const results = document.createElement('div');
  results.style.marginTop = '1em';
  button.insertAdjacentElement('afterend', results);

  for (const size of arraySizes) {
    const sizeBuffer = root
      .createBuffer(
        d.arrayOf(d.u32, size),
        Array.from({ length: size }, () => 1),
      )
      .$usage('storage');

    // JS Version
    const jsStartTime = performance.now();
    const jsArray = Array.from({ length: size }, () => 1);
    const jsResult = concurrentSumOnJS(jsArray);
    const jsEndTime = performance.now();
    const jsTime = jsEndTime - jsStartTime;

    // GPU Version
    const gpuStartTime = performance.now();
    const sumResult = await currentSum(root, sizeBuffer);
    if (!sumResult) {
      console.error(`Failed to execute currentSum for array size ${size}`);
      results.innerHTML +=
        `<strong>Error:</strong> Failed to execute currentSum for array size ${size}.<br>`;
      continue;
    }
    const gpuEndTime = performance.now();
    const gpuResult = await sumResult.read();
    const gpuTime = gpuEndTime - gpuStartTime;

    const isEqual = compareArrayWithBuffer(jsResult, gpuResult);
    if (!isEqual) {
      console.error(`Mismatch detected for array size ${size}`);
      results.innerHTML +=
        `<strong>Error:</strong> Mismatch detected for array size ${size}. Expected final sum: ${
          jsResult[jsResult.length - 1]
        }. Check console for details.<br>`;
      continue;
    }

    const resultElement = document.createElement('div');
    resultElement.innerHTML = `
      <strong>Array size: ${size.toLocaleString()}</strong><br>
      JS time: ${jsTime.toFixed(2)}ms<br>
      GPU time: ${gpuTime.toFixed(2)}ms<br>
      Speedup: ${(jsTime / gpuTime).toFixed(2)}x<br>
    `;
    results.appendChild(resultElement);
  }

  button.disabled = false;
});

function concurrentSumOnJS(arr: number[]) {
  arr.reduce((accumulator, currentValue, index) => {
    if (index > 0) {
      arr[index] = arr[index - 1] + currentValue;
    }
    return arr[index];
  }, 0);
  return arr;
}

function compareArrayWithBuffer(arr1: number[], arr2: number[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length - 1; i++) {
    if (arr1[i] !== arr2[i + 1]) {
      console.log(`Mismatch at index ${i}: ${arr1[i]} !== ${arr2[i]}`);
      return false;
    }
  }
  return true;
}

export function onCleanup() {
  root.destroy();
}
