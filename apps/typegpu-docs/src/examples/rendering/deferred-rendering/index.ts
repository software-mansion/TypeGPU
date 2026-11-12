import { tgpu, common } from 'typegpu';
import { Renderer } from './renderer.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

const renderer = new Renderer(root, context);

const autoResizer = common.attachAutoResizer({
  root,
  canvas,
  onResize() {
    const { width, height } = canvas;
    renderer.resize(width, height);
  },
});

let frameId = requestAnimationFrame(frame);
function frame() {
  renderer.render();
  frameId = requestAnimationFrame(frame);
}

export function onCleanup() {
  cancelAnimationFrame(frameId);
  autoResizer.detach();
  root.destroy();
}

// #endregion
