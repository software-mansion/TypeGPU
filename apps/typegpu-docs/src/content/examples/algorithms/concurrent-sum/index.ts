import { concurrentSum } from '@typegpu/concurrent-sum-2';
import { currentSum } from '@typegpu/concurrent-sum';
import tgpu from 'typegpu';
import * as std from 'typegpu/std';
import * as d from 'typegpu/data';
import { compareArrayWithBuffer, concurrentSumOnJS } from './utils';

const root = await tgpu.init({
  device: {
    requiredFeatures: ['timestamp-query'],
  },
});

const someData = Array.from({ length: 2 ** 22 }, (_) => 1);

const button = document.querySelector('#runButton') as HTMLButtonElement;
button.addEventListener('click', async () => {
  const buffer = root.createBuffer(d.arrayOf(d.f32, someData.length)).$usage('storage');
  buffer.write(someData);
  const buffer2 = root.createBuffer(d.arrayOf(d.u32, someData.length)).$usage('storage');
  buffer2.write(someData);

const t1 = performance.now();
const sumNew = concurrentSum(root, buffer, std.add, 0);
await root.device.queue.onSubmittedWorkDone();
const t2 = performance.now();
console.log('Concurrent sum new overall time:', t2 - t1, 'ms');

const res = await sumNew.read();
console.log(res);
console.log(compareArrayWithBuffer(concurrentSumOnJS([...someData]), res));

const t3 = performance.now();
const sumOld = await currentSum(
  root,
  buffer2,
  std.add,
  0,
  undefined,
  async (ts)  => {
    const time = await ts.read();
        const diff = Number(time[1]! - time[0]!) / 1_000_000;
        console.log(`Current sum computed in ${diff} ms`);
      },
  
);
await root.device.queue.onSubmittedWorkDone();
const t4 = performance.now();
console.log('Concurrent sum old overall time:', t4 - t3, 'ms');

const res2 = await sumOld.read();
console.log(compareArrayWithBuffer(concurrentSumOnJS([...someData]), res2));
console.log(res2);
})