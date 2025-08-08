import tgpu from 'typegpu';
import { performCalculationsWithTime } from './calculator.ts';

const bars = Array.from(document.querySelectorAll('.bar')) as HTMLDivElement[];

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

const lengthMap: Record<string, { jsTime: number; gpuTime: number }> = {
  '65536': { jsTime: 0, gpuTime: 0 },
  '131072': { jsTime: 0, gpuTime: 0 },
  '1048576': { jsTime: 0, gpuTime: 0 },
  '4194304': { jsTime: 0, gpuTime: 0 },
  '8388608': { jsTime: 0, gpuTime: 0 },
};
async function initCalc() {
  const inputArrays: number[][] = [];

  // populate arrays for calculation
  for (const length of Object.keys(lengthMap)) {
    const arrayLength = Number.parseInt(length);
    const onesArray = Array(arrayLength).fill(1);
    inputArrays.push(onesArray);
    const { success, jsTime, gpuTime } = await performCalculationsWithTime(
      root,
      onesArray,
    );
    if (success && jsTime !== undefined && gpuTime !== undefined) {
      console.log(`Calculation successful ${jsTime} and ${gpuTime}`);
      lengthMap[onesArray.length].jsTime = jsTime;
      lengthMap[onesArray.length].gpuTime = gpuTime;
    }
  }
  //calc prefix sum


  return inputArrays;
}

  function drawCharts() {
    // graph the results
    const keys = Object.keys(lengthMap);
    console.log('Keys:', keys);
    for (let i = 0; i < bars.length/2; i++) {
      const value = lengthMap[keys[i]];
      console.log('bars lenght', bars.length)
      console.log(`Bar ${i} value:`, value);
        // Set the height of the bar based on relative time
        bars[2*i].style.setProperty('--bar-height', `${value.jsTime / 50}`);
        bars[2*i].style.setProperty('--highlight-opacity', '1');
        // Add the time value inside the bar
        bars[2*i].textContent = `${value.jsTime.toFixed(1)}`;

        // Set the height of the bar based on relative time
        bars[2*i+1].style.setProperty('--bar-height', `${value.gpuTime / 50}`);
        bars[2*i+1].style.setProperty('--highlight-opacity', '1');
        // Add the time value inside the bar
        bars[2*i+1].textContent = `${value.gpuTime.toFixed(1)}`;

    }
  }

const uiState = {
  isDrawing: false,
  lastPos: null as { x: number; y: number } | null,
  isBlank: true,
};

function resetDrawing() {
  uiState.lastPos = null;
  uiState.isBlank = true;

  for (const bar of bars) {
    bar.style.setProperty('--bar-width', '0.2');
  }
}

export const controls = {
  Reset: {
    onButtonClick: initCalc,
  },
  Draw: {
    onButtonClick: drawCharts,
  },
};
