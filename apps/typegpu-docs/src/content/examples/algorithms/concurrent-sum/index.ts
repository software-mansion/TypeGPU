import { currentSum } from '@typegpu/concurrent-sum';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { compareArrayWithBuffer, concurrentSumOnJS } from './utils.ts';

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

const arraySizes = [2 ** 20];
const button = document.querySelector('#runButton') as HTMLButtonElement;
const dataArrs = arraySizes.map((size) => {
  return Array.from({ length: size }, () => 1);
});

button.addEventListener('click', async () => {
  button.disabled = true;

  // const arraySizes = [2**12];
  const results = document.createElement('div');
  results.style.marginTop = '1em';
  button.insertAdjacentElement('afterend', results);

  for (const size of arraySizes) {
    const sizeBuffer = root
      .createBuffer(
        d.arrayOf(d.u32, size),
      )
      .$usage('storage');
    sizeBuffer.write(dataArrs[arraySizes.indexOf(size)]);

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

export function onCleanup() {
  root.destroy();
}
