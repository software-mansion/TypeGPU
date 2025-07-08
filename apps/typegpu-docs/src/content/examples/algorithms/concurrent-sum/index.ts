import { currentSum } from '@typegpu/concurrent-sum';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const fixedArrayLength = 2 ** 16;

const root = await tgpu.init({
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

const button = document.querySelector('#runButton') as HTMLButtonElement;

button.addEventListener('click', async () => {
  button.disabled = true;

  const jsArray = Array.from({ length: fixedArrayLength }, (_, k) => k);
  const jsResult = concurrentSumOnJS(jsArray);
  console.log('JS Result:', jsResult);

  const gpuResult = await (await currentSum(root, buffer)).read();
  console.log('GPU Result:', gpuResult);

  const isEqual = compareArrayWithBuffer(jsResult, gpuResult);
  console.log('Are results equal?', isEqual);

  button.disabled = false;
});

function concurrentSumOnJS(arr: number[]) {
  arr.reduce((accumulator, currentValue, index) => {
    if (index > 0) {
      arr[index] = arr[index - 1] + currentValue;
    }
    return arr[index];
  }, 0);
  return arr;
}

function compareArrayWithBuffer(arr1: number[], arr2: number[]): boolean {
  if (arr1.length !== arr2.length) {
    return false;
  }
  for (let i = 0; i < arr1.length - 1; i++) {
    if (arr1[i] !== arr2[i + 1]) {
      console.log(`Mismatch at index ${i}: ${arr1[i]} !== ${arr2[i]}`);
      return false;
    }
  }
  return true;
}

export function onCleanup() {
  root.destroy();
}
