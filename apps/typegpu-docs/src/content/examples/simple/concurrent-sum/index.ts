import { computeShader } from '@typegpu/concurrent-sum';
import {
  dataBindGroupLayout,
  inputValueType,
} from './../../../../../../../packages/typegpu-concurrent-sum/src/schemas.ts';
import tgpu from 'typegpu';

const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const buffer = root.createBuffer(inputValueType, {
  in: Array.from({ length: 1024 }, (_, k) => k),
}).$usage('storage');
const fooBindGroup = root.createBindGroup(dataBindGroupLayout, {
  inputArray: buffer,
});

const computePipeline = root['~unstable']
  .withCompute(computeShader)
  .createPipeline()
  .$name('compute');

setTimeout(() => {
  computePipeline
    .with(dataBindGroupLayout, fooBindGroup)
    .dispatchWorkgroups(1);
  console.log('Compute shader dispatched');

  // read buffer
  buffer.read().then((result) => {
    console.log('Result:', result);
  }).catch((error) => {
    console.error('Error reading buffer:', error);
  });
}, 100);

export function onCleanup() {
  root.destroy();
}
