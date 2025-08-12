import * as Plot from '@observablehq/plot';

import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { randf } from '@typegpu/noise';

const N = 10000;

const range = Array.from(
  { length: Math.round((10 - (-10)) / 0.05) + 1 },
  (_, i) => -10 + i * 0.05,
);

const root = await tgpu.init();
const b = root.createBuffer(d.arrayOf(d.f32, N)).$usage('storage');
const bView = b.as('mutable');

const f1 = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(() => {
  for (let i = d.i32(0); i < d.i32(N); i++) {
    bView.$[i] = randf.bernoulli(0.5);
  }
});

const p1 = root['~unstable'].withCompute(f1).createPipeline();
p1.dispatchWorkgroups(1);
const samples1 = (await b.read()).filter((x) => x >= -20 && x <= 20);

// const plot1 = Plot.plot({
//   title: 'Bern(0.5): 1 worker samples 10000 values',
//   y: { grid: true },
//   marks: [
//     Plot.rectY(
//       samples1,
//       Plot.binX(
//         { y: 'count' },
//         { x: (d) => d, fill: 'lightblue' } as Plot.BinXInputs<undefined>,
//       ),
//     ),
//     Plot.ruleY([0]),
//   ],
// });
const plot1 = Plot.plot({
  title: 'Bern(0.5): 1 worker samples 10000 values',
  y: {
    grid: true,
    percent: true,
  },
  marks: [
    Plot.ruleY([0]),
    Plot.barY(
      samples1,
      Plot.groupX({ y: 'proportion' }, { x: (d) => d, fill: 'lightblue' }),
    ),
  ],
});
const div1 = document.getElementById('hist1');
div1?.append(plot1);

const f2 = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [1],
})((input) => {
  randf.seed2(d.vec2f(input.gid.xy));
  bView.$[input.gid.x * 100 + input.gid.y] = randf.bernoulli(0.5);
});

const p2 = root['~unstable'].withCompute(f2).createPipeline();
p2.dispatchWorkgroups(100, 100);
const samples2 = (await b.read()).filter((x) => x >= -20 && x <= 20);

console.log(samples1);
console.log(samples2);

// const plot2 = Plot.plot({
//   title: 'Bern(0.5): 10000 workers, each sampling 1 value with seed2(xy)',
//   y: { grid: true },
//   marks: [
//     Plot.rectY(
//       samples2,
//       Plot.binX(
//         { y: 'count' },
//         { x: (d) => d, fill: 'lightblue' } as Plot.BinXInputs<undefined>,
//       ),
//     ),
//     Plot.ruleY([0]),
//   ],
// });
const plot2 = Plot.plot({
  title: 'Bern(0.5): 10000 workers, each sampling 1 value with seed2(xy)',
  y: {
    grid: true,
    percent: true,
  },
  marks: [
    Plot.ruleY([0]),
    Plot.barY(
      samples2,
      Plot.groupX({ y: 'proportion' }, { x: (d) => d, fill: 'lightblue' }),
    ),
  ],
});
const div2 = document.getElementById('hist2');
div2?.append(plot2);
