import tgpu from 'typegpu';

const root = await tgpu.init();
const device = root.device;

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device,
  format: 'bgra8unorm',
  alphaMode: 'opaque',
});

export function onCleanup() {
  root.destroy();
  root.device.destroy();
}
