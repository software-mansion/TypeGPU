import tgpu from 'typegpu';

export const root = await tgpu.init();
export const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
export const canvas = document.querySelector('canvas') as HTMLCanvasElement;
export const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});
