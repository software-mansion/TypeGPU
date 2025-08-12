import tgpu from 'typegpu';
import * as std from 'typegpu/std';
import { performCalculationsWithTime } from './calculator.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const bars = Array.from(document.querySelectorAll<HTMLDivElement>('.bar'));
const speedupLabels = Array.from(
  document.querySelectorAll<HTMLDivElement>('.speedup-label'),
);
const tooltips = Array.from(
  document.querySelectorAll<HTMLDivElement>('.bar-tooltip'),
);

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

const lengthMap: Record<
  string,
  { jsTime: number; gpuTime: number; gpuShaderTime: number }
> = {
  '65536': { jsTime: 0, gpuTime: 0, gpuShaderTime: 0 },
  '131072': { jsTime: 0, gpuTime: 0, gpuShaderTime: 0 },
  '1048576': { jsTime: 0, gpuTime: 0, gpuShaderTime: 0 },
  '4194304': { jsTime: 0, gpuTime: 0, gpuShaderTime: 0 },
  '8388608': { jsTime: 0, gpuTime: 0, gpuShaderTime: 0 },
};
async function initCalc() {
  const inputArrays: number[][] = [];

  for (const length of Object.keys(lengthMap)) {
    const arrayLength = Number.parseInt(length);
    const onesArray = Array(arrayLength).fill(1);
    inputArrays.push(onesArray);
    const { success, jsTime, gpuTime, gpuShaderTime } =
      await performCalculationsWithTime(
        root,
        onesArray,
      );
    if (success && jsTime !== undefined && gpuTime !== undefined) {
      lengthMap[onesArray.length].jsTime = jsTime;
      lengthMap[onesArray.length].gpuTime = gpuTime;
      lengthMap[onesArray.length].gpuShaderTime = gpuShaderTime;
    }
  }
  return inputArrays;
}

function drawCharts() {
  const keys = Object.keys(lengthMap);
  console.log('bars length:', bars.length);
  for (let i = 0; i < bars.length / 3; i++) {
    console.log('i:', i, 'keys.length:', keys.length);
    const value = lengthMap[keys[i]];
    console.log(value);
    speedupLabels[i].textContent = `${
      (Number(value.jsTime) / Number(value.gpuShaderTime)).toFixed(1)
    }x`;

    // CPU
    bars[3 * i].style.setProperty(
      '--bar-height',
      `${std.min(value.jsTime / 30, 1)}`,
    );
    bars[3 * i].style.setProperty('--highlight-opacity', '1');
    tooltips[3 * i].textContent = `JS time: ${
      Number(value.jsTime).toFixed(2)
    }ms  |  Array size: ${keys[i]}`;

    // GPU
    bars[3 * i + 1].style.setProperty(
      '--bar-height',
      `${std.min(value.gpuTime / 30, 1)}`,
    );
    bars[3 * i + 1].style.setProperty('--highlight-opacity', '1');
    tooltips[3 * i + 1].textContent = `Total GPU time: ${
      Number(value.gpuTime).toFixed(2)
    }ms  |  Array size: ${keys[i]}`;

    // GPU shader
    bars[3 * i + 2].style.setProperty(
      '--bar-height',
      `${std.min(value.gpuShaderTime / 30, 1)}`,
    );
    bars[3 * i + 2].style.setProperty('--highlight-opacity', '1');
    tooltips[3 * i + 2].textContent = `GPU shader time: ${
      Number(value.gpuShaderTime).toFixed(2)
    }ms  |  Array size: ${keys[i]}`;
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

  for (const label of speedupLabels) {
    label.textContent = '';
  }
}

export const controls = {
  Reset: {
    onButtonClick: initCalc,
  },
  Draw: {
    onButtonClick: drawCharts,
  },
  Calculate: {
    onButtonClick: async () => {
      await initCalc();
      // wait 3s
      drawCharts();
    },
  },
};
