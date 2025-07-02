import { currentSum } from '@typegpu/concurrent-sum';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
export const fixedArrayLength = 2 ** 10;

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
    d.arrayOf(d.f32, fixedArrayLength),
    Array.from({ length: fixedArrayLength }, (_, k) => k),
  )
  .$usage('storage');

currentSum(root, buffer);

export function onCleanup() {
  root.destroy();
}
