import { tgpu } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { performCalculationsWithTime } from './calculator.ts';

const SIZES = [21037, 131072, 1048576, 4194304, 8388608] as const;

const root = await tgpu.init({
  device: {
    requiredFeatures: ['timestamp-query'],
  },
});

const dataGroups = Array.from(document.querySelectorAll<HTMLDivElement>('.data-group'));
const yAxisLabels = Array.from(document.querySelectorAll<HTMLSpanElement>('.y-axis-labels span'));

const results = SIZES.map(() => ({
  jsTime: 0,
  uploadTime: 0,
  computeTime: 0,
  syncTime: 0,
  readbackTime: 0,
}));

const SEGMENTS = [
  { cls: '.seg-upload', key: 'uploadTime', label: 'Upload' },
  { cls: '.seg-compute', key: 'computeTime', label: 'GPU compute' },
  { cls: '.seg-sync', key: 'syncTime', label: 'Submit & sync' },
  { cls: '.seg-readback', key: 'readbackTime', label: 'Readback' },
] as const;

function drawCharts() {
  const overallMax = Math.max(
    ...results.map((r) =>
      Math.max(r.jsTime, r.uploadTime + r.computeTime + r.syncTime + r.readbackTime),
    ),
  );

  // Update y-axis
  const ticks =
    overallMax <= 0 ? [0, 0, 0, 0, 0] : Array.from({ length: 5 }, (_, i) => (i / 4) * overallMax);
  for (const [i, label] of yAxisLabels.toReversed().entries()) {
    label.textContent = ticks[i].toFixed(1);
  }

  for (const [i, group] of dataGroups.entries()) {
    const r = results[i];

    // Update speedup label
    const speedup = r.computeTime > 0 ? (r.jsTime / r.computeTime).toFixed(1) : '-';
    (group.querySelector('.speedup-label') as HTMLDivElement).textContent = `${speedup}x`;

    // Update bars and tooltips
    const jsBar = group.querySelector('.bar-js') as HTMLDivElement;
    jsBar.style.setProperty('--bar-height', `${overallMax > 0 ? r.jsTime / overallMax : 0}`);
    (jsBar.querySelector('.bar-tooltip') as HTMLDivElement).textContent =
      `JS: ${r.jsTime.toFixed(2)}ms`;

    for (const s of SEGMENTS) {
      const segment = group.querySelector(s.cls) as HTMLDivElement;
      const value = r[s.key];
      segment.style.setProperty('--seg-height', `${overallMax > 0 ? value / overallMax : 0}`);
      segment.classList.toggle('nonzero', value > 0);
      (segment.querySelector('.bar-tooltip') as HTMLDivElement).textContent =
        `${s.label}: ${value.toFixed(2)}ms`;
    }
  }
}

async function runBenchmarks() {
  for (const [i, size] of SIZES.entries()) {
    const input = new Float32Array(size).fill(1);
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
