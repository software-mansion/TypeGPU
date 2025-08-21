import tgpu from 'typegpu';
import { performCalculationsWithTime } from './calculator.ts';
import { getNiceYAxisLabels } from './utils.ts';

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
const yAxisLabels = Array.from(
  document.querySelectorAll<HTMLSpanElement>('.y-axis-labels span'),
);
let dropdown = '8388608';

const root = await tgpu.init({
  device: {
    requiredFeatures: [
      'timestamp-query',
    ],
  },
});

let yAxisTicks: number[] = [];

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
  const maxJsTime = Math.max(...Object.values(lengthMap).map((x) => x.jsTime));
  const maxGpuTime = Math.max(
    ...Object.values(lengthMap).map((x) => x.gpuTime),
  );
  const maxGpuShaderTime = Math.max(
    ...Object.values(lengthMap).map((x) => x.gpuShaderTime),
  );
  const overallMax = Math.max(maxJsTime, maxGpuTime, maxGpuShaderTime);

  yAxisTicks = getNiceYAxisLabels(overallMax);
  const reversedLabels = yAxisLabels.slice().reverse();
  for (let index = 0; index < reversedLabels.length; index++) {
    const label = reversedLabels[index];
    label.textContent = yAxisTicks[index].toFixed(1);
  }

  const keys = Object.keys(lengthMap);
  for (let i = 0; i < bars.length / 3; i++) {
    const value = lengthMap[keys[i]];
    speedupLabels[i].textContent = `${
      (Number(value.jsTime) / Number(value.gpuShaderTime)).toFixed(1)
    }x`;
    xAxisLabels[i].textContent = keys[i];

    // CPU
    const normalizedJsHeight = maxJsTime > 0 ? value.jsTime / overallMax : 0;
    bars[3 * i].style.setProperty(
      '--bar-height',
      `${normalizedJsHeight}`,
    );
    bars[3 * i].style.setProperty('--highlight-opacity', '1');
    tooltips[3 * i].textContent = `JS time: ${
      Number(value.jsTime).toFixed(2)
    }ms  |  Array size: ${keys[i]}`;

    // GPU
    const normalizedGpuHeight = maxGpuTime > 0 ? value.gpuTime / overallMax : 0;
    bars[3 * i + 1].style.setProperty(
      '--bar-height',
      `${normalizedGpuHeight}`,
    );
    bars[3 * i + 1].style.setProperty('--highlight-opacity', '1');
    tooltips[3 * i + 1].textContent = `Total GPU time: ${
      Number(value.gpuTime).toFixed(2)
    }ms  |  Array size: ${keys[i]}`;

    // GPU shader
    const normalizedGpuShaderHeight = maxGpuShaderTime > 0
      ? value.gpuShaderTime / overallMax
      : 0;
    bars[3 * i + 2].style.setProperty(
      '--bar-height',
      `${normalizedGpuShaderHeight}`,
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
