import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init();
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

function draw(timestamp: number) {
  lastFrameId = requestAnimationFrame(draw);
}
let lastFrameId = requestAnimationFrame(draw);

// #region Example controls and cleanup

export function onCleanup() {
  cancelAnimationFrame(lastFrameId);
  root.destroy();
}

// #endregion
