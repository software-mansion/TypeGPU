const N = 10_000_000;
const values = Array.from({ length: N }, () => {
  return Math.random();
});

// 2. Divide [-2, 2] into 50 bins
const binCount = 50;
const min = -2;
const max = 2;
const binWidth = (max - min) / binCount;
const bins = Array(binCount).fill(0);

for (const val of values) {
  let idx = Math.floor((val - min) / binWidth);
  if (idx < 0) idx = 0;
  if (idx >= binCount) idx = binCount - 1;
  bins[idx]++;
}

const maxBin = Math.max(...bins);

// 3.1 Draw histogram with raw css
// const container = document.getElementById('bars-container');

// for (let i = 0; i < 50; i++) {
//   const bar = document.createElement('div');
//   bar.className = 'bar';
//   bar.style.height = '10px';
//   container?.appendChild(bar);
// }

// const normalized = bins.map((bin) => bin / maxBin);

// const bars = Array.from(document.querySelectorAll('.bar')) as HTMLDivElement[];

// bars.forEach((bar, i) => {
//   bar.style.setProperty('--bar-height', `${normalized[i]}`);
//   bar.style.setProperty('--highlight-opacity', '1');
// });

// 3.2 Draw histogram with plotly
import Plotly from 'plotly.js-dist-min';

// Generate normal distribution data using Box-Muller transform
function generateNormalData(
  mean: number,
  stdDev: number,
  count: number,
): number[] {
  const data: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = 1 - Math.random();
    const v = 1 - Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    data.push(z * stdDev + mean);
  }
  return data;
}

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { randf } from '@typegpu/noise';

const root = await tgpu.init();
const b = root.createBuffer(d.arrayOf(d.f32, 1000000)).$usage('storage');
const bView = b.as('mutable');

const f = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(() => {
  for (let i = d.i32(0); i < d.i32(1000000); i++) {
    bView.$[i] = randf.sample();
  }
});

const p = root['~unstable'].withCompute(f).createPipeline();
p.dispatchWorkgroups(1);
const samples = await b.read();

function kde(xs: number[], data: number[], bandwidth: number): number[] {
  const norm = 1 / (bandwidth * Math.sqrt(2 * Math.PI));
  return xs.map((x) =>
    data.reduce(
      (sum, xi) => sum + Math.exp(-0.5 * ((x - xi) / bandwidth) ** 2),
      0,
    ) * norm / data.length
  );
}

// const samples = generateNormalData(0, 1, 1000000);

const trace = {
  x: samples,
  type: 'histogram' as const,
  opacity: 0.5,
  nbinsx: 50,
  name: 'Bins',
};

const xMin = samples.reduce((a, b) => Math.min(a, b), Number.POSITIVE_INFINITY);
const xMax = samples.reduce((a, b) => Math.max(a, b), Number.NEGATIVE_INFINITY);
const xs = Array.from({ length: 100 }, (_, i) => xMin + (xMax - xMin) * i / 99);
const bandwidth = 0.3;
const density = kde(xs, samples, bandwidth);

const traceKDE = {
  x: xs,
  y: density,
  mode: 'lines' as const,
  name: 'KDE',
};

Plotly.newPlot('hist', [trace as Partial<Plotly.PlotData>]);
