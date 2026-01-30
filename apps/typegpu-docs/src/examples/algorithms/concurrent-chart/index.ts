import tgpu from 'typegpu';
import { performCalculationsWithTime } from './calculator.ts';

const barElements = document.querySelectorAll<HTMLDivElement>('.bar');
const bars = Array.from({ length: 5 }, (_, i) => ({
  jsBar: barElements[i * 3 + 0],
  gpuTotalBar: barElements[i * 3 + 1],
  gpuBar: barElements[i * 3 + 2],
}));
bars.forEach((bar) => {
  bar.jsBar.style.setProperty('--highlight-opacity', '1');
  bar.gpuTotalBar.style.setProperty('--highlight-opacity', '1');
  bar.gpuBar.style.setProperty('--highlight-opacity', '1');
});

const tooltipElements = document.querySelectorAll<HTMLDivElement>(
  '.bar-tooltip',
);
const tooltips = Array.from({ length: 5 }, (_, i) => ({
  jsTooltip: tooltipElements[i * 3 + 0],
  gpuTotalTooltip: tooltipElements[i * 3 + 1],
  gpuTooltip: tooltipElements[i * 3 + 2],
}));
const speedupLabels = Array.from(
  document.querySelectorAll<HTMLDivElement>('.speedup-label'),
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

  yAxisTicks = overallMax <= 0
    ? [0, 0, 0, 0, 0]
    : Array.from({ length: 5 }, (_, i) => (i / 4) * overallMax);

  const reversedLabels = yAxisLabels.slice().reverse();
  for (let index = 0; index < reversedLabels.length; index++) {
    const label = reversedLabels[index];
    label.textContent = yAxisTicks[index].toFixed(1);
  }

  const keys = Object.keys(lengthMap);
  for (let i = 0; i < bars.length; i++) {
    const value = lengthMap[keys[i]];
    const bar = bars[i];
    const tooltip = tooltips[i];
    speedupLabels[i].textContent = `${
      (value.jsTime / value.gpuShaderTime).toFixed(1)
    }x`;
    xAxisLabels[i].textContent = keys[i];

    // CPU
    const normalizedJsHeight = maxJsTime > 0 ? value.jsTime / overallMax : 0;
    bar.jsBar.style.setProperty('--bar-height', `${normalizedJsHeight}`);
    tooltip.jsTooltip.textContent = `JS time: ${
      value.jsTime.toFixed(2)
    }ms  |  Array size: ${keys[i]}`;

    // GPU Total
    const normalizedGpuHeight = maxGpuTime > 0 ? value.gpuTime / overallMax : 0;
    bar.gpuTotalBar.style.setProperty('--bar-height', `${normalizedGpuHeight}`);
    tooltip.gpuTotalTooltip.textContent = `Total GPU time: ${
      value.gpuTime.toFixed(2)
    }ms  |  Array size: ${keys[i]}`;

    // GPU shader
    const normalizedGpuShaderHeight = maxGpuShaderTime > 0
      ? value.gpuShaderTime / overallMax
      : 0;
    bar.gpuBar.style.setProperty(
      '--bar-height',
      `${normalizedGpuShaderHeight}`,
    );
    tooltip.gpuTooltip.textContent = `GPU shader time: ${
      value.gpuShaderTime.toFixed(2)
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
