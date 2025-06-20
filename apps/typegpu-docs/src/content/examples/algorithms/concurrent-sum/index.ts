import { currentSum } from '@typegpu/concurrent-sum';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { fixedArrayLength } from '../../../../../../../packages/typegpu-concurrent-sum/src/schemas.ts';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

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

const buffer = root.createBuffer(
  d.arrayOf(d.f32, fixedArrayLength),
  Array.from({ length: fixedArrayLength }, (_, k) => k),
).$usage('storage');

currentSum(root, buffer);

export function onCleanup() {
  root.destroy();
}
