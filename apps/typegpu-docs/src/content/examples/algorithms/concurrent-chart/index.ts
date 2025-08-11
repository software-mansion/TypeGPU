import tgpu from 'typegpu';
import * as std from 'typegpu/std';
import { performCalculationsWithTime } from './calculator.ts';


const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const bars = Array.from(document.querySelectorAll<HTMLDivElement>('.bar'));
const labels = Array.from(bars, bar => bar.querySelector<HTMLDivElement>('.label'));


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

  for (const length of Object.keys(lengthMap)) {
    const arrayLength = Number.parseInt(length);
    const onesArray = Array(arrayLength).fill(1);
    inputArrays.push(onesArray);
    const { success, jsTime, gpuTime } = await performCalculationsWithTime(
      root,
      onesArray,
    );
    if (success && jsTime !== undefined && gpuTime !== undefined) {
      lengthMap[onesArray.length].jsTime = jsTime;
      lengthMap[onesArray.length].gpuTime = gpuTime;
    }
  }
  return inputArrays;
}

function drawCharts() {
  const keys = Object.keys(lengthMap);
  for (let i = 0; i < bars.length / 2; i++) {
    const value = lengthMap[keys[i]];
    bars[2 * i].style.setProperty('--bar-height', `${std.min(value.jsTime / 50, 1)}`);
    bars[2 * i].style.setProperty('--highlight-opacity', '1');
    labels[2 * i]!.textContent = `${(Number(value.jsTime) / Number(value.gpuTime)).toFixed(1)}x`;

    bars[2 * i + 1].style.setProperty('--bar-height', `${std.min(value.gpuTime / 50, 1)}`);
    bars[2 * i + 1].style.setProperty('--highlight-opacity', '1');
    // labels[2 * i + 1]!.textContent = `size: ${keys[i]}`;
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
    const label = bar.querySelector<HTMLDivElement>('.label');
    if (label) label.textContent = 'Duap';
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
