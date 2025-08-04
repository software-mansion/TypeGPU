import tgpu from 'typegpu';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const root = await tgpu.init();

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// TODO: load sandwich2.obj
// SOURCE: https://sketchfab.com/3d-models/sandwich-ef5346a535fa4a0ebaf631dea1a7cea5
