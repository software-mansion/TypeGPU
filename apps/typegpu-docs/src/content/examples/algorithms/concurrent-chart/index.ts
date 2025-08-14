import tgpu from 'typegpu';
import * as std from 'typegpu/std';
import { performCalculationsWithTime } from './calculator.ts';

const bars = Array.from(document.querySelectorAll<HTMLDivElement>('.bar'));
const speedupLabels = Array.from(
  document.querySelectorAll<HTMLDivElement>('.speedup-label'),
);
const tooltips = Array.from(
  document.querySelectorAll<HTMLDivElement>('.bar-tooltip'),
);
const xAxisLabels = Array.from(
  document.querySelectorAll<HTMLDivElement>('.x-axis-label'),
);
let dropdown = '8388608';

const root = await tgpu.init({
  device: {
    requiredFeatures: [
      'timestamp-query',
    ],
  },
});

const lengthMap: Record<
  string,
  { jsTime: number; gpuTime: number; gpuShaderTime: number }
> = {
  '21037': { jsTime: 0, gpuTime: 0, gpuShaderTime: 0 },
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
    if (
      success && jsTime !== undefined && gpuTime !== undefined &&
      gpuShaderTime !== undefined
    ) {
      lengthMap[onesArray.length].jsTime = jsTime;
      lengthMap[onesArray.length].gpuTime = gpuTime;
      lengthMap[onesArray.length].gpuShaderTime = gpuShaderTime;
    }
  }
  return inputArrays;
}
function drawCharts() {
  const keys = Object.keys(lengthMap);
  for (let i = 0; i < bars.length / 3; i++) {
    const value = lengthMap[keys[i]];
    speedupLabels[i].textContent = `${
      (Number(value.jsTime) / Number(value.gpuShaderTime)).toFixed(1)
    }x`;
    xAxisLabels[i].textContent = keys[i];

    // CPU
    bars[3 * i].style.setProperty(
      '--bar-height',
      `${std.min(value.jsTime / 30, 1.15)}`,
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

export const controls = {
  Calculate: {
    onButtonClick: async () => {
      await initCalc();
      drawCharts();
    },
  },
  'Array length': {
    initial: '8388608',
    options: [2 ** 19, 2 ** 21, 2 ** 23, 2 ** 24].map((x) => x.toString()),
    async onSelectChange(value: string) {
      delete lengthMap[dropdown];
      dropdown = value;
      lengthMap[dropdown] = { jsTime: 0, gpuTime: 0, gpuShaderTime: 0 };
      await initCalc();
      drawCharts();
    },
  },
};
