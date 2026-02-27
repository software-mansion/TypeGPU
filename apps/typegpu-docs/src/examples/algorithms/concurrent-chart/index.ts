import tgpu from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { performCalculationsWithTime } from './calculator.ts';

const SIZES = [21037, 131072, 1048576, 4194304, 8388608] as const;

const root = await tgpu.init({
  device: {
    requiredFeatures: ['timestamp-query'],
  },
});

const dataGroups = Array.from(
  document.querySelectorAll<HTMLDivElement>('.data-group'),
);
const yAxisLabels = Array.from(
  document.querySelectorAll<HTMLSpanElement>('.y-axis-labels span'),
);

const results = SIZES.map(() => ({ jsTime: 0, gpuTime: 0, gpuShaderTime: 0 }));

function drawCharts() {
  const overallMax = Math.max(
    ...results.map((r) => Math.max(r.jsTime, r.gpuTime, r.gpuShaderTime)),
  );

  // Update y-axis
  const ticks = overallMax <= 0
    ? [0, 0, 0, 0, 0]
    : Array.from({ length: 5 }, (_, i) => (i / 4) * overallMax);
  for (const [i, label] of yAxisLabels.toReversed().entries()) {
    label.textContent = ticks[i].toFixed(1);
  }

  const metrics = [
    { cls: '.bar-js', key: 'jsTime', label: 'JS' },
    { cls: '.bar-gpu-total', key: 'gpuTime', label: 'Total GPU' },
    { cls: '.bar-gpu-shader', key: 'gpuShaderTime', label: 'GPU shader' },
  ] as const;

  for (const [i, group] of dataGroups.entries()) {
    const r = results[i];

    // Update speedup label
    const speedup = r.gpuShaderTime > 0
      ? (r.jsTime / r.gpuShaderTime).toFixed(1)
      : '-';
    (group.querySelector('.speedup-label') as HTMLDivElement).textContent =
      `${speedup}x`;

    // Update bars and tooltips
    for (const m of metrics) {
      const bar = group.querySelector(m.cls) as HTMLDivElement;
      const value = r[m.key];
      const height = overallMax > 0 ? value / overallMax : 0;
      bar.style.setProperty('--bar-height', `${height}`);

      const tooltip = bar.querySelector('.bar-tooltip') as HTMLDivElement;
      tooltip.textContent = `${m.label}: ${value.toFixed(2)}ms`;
    }
  }
}

async function runBenchmarks() {
  for (const [i, size] of SIZES.entries()) {
    const input = Array(size).fill(1);
    const result = await performCalculationsWithTime(root, input);
    if (result.success) {
      results[i] = result;
    }
  }
  drawCharts();
}

void runBenchmarks();

// #region Example controls & Cleanup

export const controls = defineControls({
  Recalculate: {
    onButtonClick: runBenchmarks,
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
