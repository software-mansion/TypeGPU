import { currentSum } from '@typegpu/concurrent-sum';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
// const fixedArrayLength = 512;
const fixedArrayLength = 2 ** 16;

const root = await tgpu.init({
  adapter: {
    powerPreference: 'high-performance',
  },
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

const buffer = root
  .createBuffer(
    d.arrayOf(d.u32, fixedArrayLength),
    Array.from({ length: fixedArrayLength }, (_, k) => k),
  )
  .$usage('storage');

currentSum(root, buffer);
// const work = await (await currentSum(root, buffer)).read();
// console.log('Result:', work);

// COMPUTE EXPECTED
const arr = [...Array(fixedArrayLength).keys()];
console.log(
  'Expected sum: ',
  arr.reduce(
    (accumulator, currentValue) => accumulator + currentValue,
    0,
  ),
);

export function onCleanup() {
  root.destroy();
}
