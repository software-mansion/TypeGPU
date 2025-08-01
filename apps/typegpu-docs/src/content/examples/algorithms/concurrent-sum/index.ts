import tgpu from 'typegpu';
import { performCalculationsWithTime } from './sum.ts';

let arraySize = 2 ** 13;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

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
let inputArray: number[];

button.addEventListener('click', async () => {
  button.disabled = true;
  const results = document.createElement('div');
  results.style.marginTop = '1em';
  button.insertAdjacentElement('afterend', results);

  // Recreate the input array with the current arraySize
  inputArray = Array.from({ length: arraySize }, (_, i) => 1);
  const sumResults = await performCalculationsWithTime(root, [...inputArray]);
  if (!sumResults.success) {
    results.innerHTML += `<strong>Error:</strong> ${sumResults.error}<br>`;
    if (sumResults.jsTime !== undefined || sumResults.gpuTime !== undefined) {
      const resultElement = document.createElement('div');
      let resultHTML =
        `<strong>Array size: ${sumResults.arraySize.toLocaleString()}</strong><br>`;

      if (sumResults.jsTime !== undefined) {
        resultHTML += `JS time: ${sumResults.jsTime.toFixed(2)}ms<br>`;
      }

      if (sumResults.gpuTime !== undefined) {
        resultHTML += `GPU time: ${sumResults.gpuTime.toFixed(2)}ms<br>`;
      }

      if (sumResults.gpuInternalTime !== undefined) {
        resultHTML += `GPU internal time: ${
          sumResults.gpuInternalTime.toFixed(2)
        }ms<br>`;
      }

      resultElement.innerHTML = resultHTML;
      results.appendChild(resultElement);
    }
  } else {
    if (sumResults.gpuInternalTime !== undefined) {
      results.innerHTML += `<strong>GPU time for currentSum: ${
        sumResults.gpuInternalTime.toFixed(2)
      } ms</strong><br>`;
    }

    const { arraySize, jsTime, gpuTime, speedup } = sumResults;

    const resultElement = document.createElement('div');
    resultElement.innerHTML = `
      <strong>Array size: ${arraySize.toLocaleString()}</strong><br>
      ${jsTime !== undefined ? `JS time: ${jsTime.toFixed(2)}ms<br>` : ''}
      ${gpuTime !== undefined ? `GPU time: ${gpuTime.toFixed(2)}ms<br>` : ''}
      ${speedup !== undefined ? `Speedup: ${speedup.toFixed(2)}x<br>` : ''}
    `;
    results.appendChild(resultElement);
  }

  button.disabled = false;
});

export function onCleanup() {
  root.destroy();
}
// #region UI
const firstTable = document.querySelector('.matrix-a') as HTMLDivElement;
const secondTable = document.querySelector('.matrix-b') as HTMLDivElement;
const resultTable = document.querySelector('.matrix-result') as HTMLDivElement;
// #endregion

// #region Example controls & Cleanup
const paramSettings = {
  min: 2048,
  step: 100,
  max: 2 ** 23,
};

export const controls = {
  'Array length': {
    initial: 2 ** 18,
    ...paramSettings,
    onSliderChange: (value: number) => {
      arraySize = value;
      // Update the inputArray when the slider changes
      inputArray = Array.from({ length: arraySize }, (_, i) => 1);
    },
  },
};
// #endregion
