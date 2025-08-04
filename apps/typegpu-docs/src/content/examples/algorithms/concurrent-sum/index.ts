import { concurrentSum } from '@typegpu/concurrent-sum-2';
import { currentSum } from '@typegpu/concurrent-sum';
import tgpu from 'typegpu';
import * as std from 'typegpu/std';
import * as d from 'typegpu/data';

const root = await tgpu.init({
  device: {
    requiredFeatures: ['timestamp-query'],
  },
});

const someData = Array.from({ length: 2 ** 24 }, (_, idx) => 1);
const t1 = performance.now();
const sum = concurrentSum(root, someData);
await root.device.queue.onSubmittedWorkDone();
const t2 = performance.now();
sum.read().then(console.log);

const t3 = performance.now();
const buffer2 = root.createBuffer(d.arrayOf(d.u32, someData.length), someData)
  .$usage('storage');
const sum2 = await currentSum(
  root,
  buffer2,
  std.add,
  0,
  undefined,
  (qs) =>
    qs.read().then(
      (ts) => {
        const diff = Number(ts[1]! - ts[0]!) / 1_000_000;
        console.log(`Current sum computed in ${diff} ms`);
      },
    ),
);
await root.device.queue.onSubmittedWorkDone();
const t4 = performance.now();
sum2.read().then(console.log);
