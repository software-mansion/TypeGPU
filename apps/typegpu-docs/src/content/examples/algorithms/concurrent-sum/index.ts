import tgpu from 'typegpu';
import { sumWithTime } from './sum.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

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

const button = document.querySelector('#runButton') as HTMLButtonElement;
const arraySizes = [2 ** 20];
const dataArrs = arraySizes.map((size) => {
  return Array.from({ length: size }, () => 1);
});

button.addEventListener('click', async () => {
  button.disabled = true;
  const results = document.createElement('div');
  results.style.marginTop = '1em';
  button.insertAdjacentElement('afterend', results);

  for (const array of dataArrs) {
    sumWithTime(
      root,
      array,
      results,
    );
  }

  button.disabled = false;
});

export function onCleanup() {
  root.destroy();
}
