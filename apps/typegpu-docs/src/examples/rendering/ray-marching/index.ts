import { tgpu, common } from 'typegpu';

import { setupScene } from './scene.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const scene = await setupScene(root, context);

const autoResizer = common.attachAutoResizer({
  root,
  canvas,
  onResize() {
    scene.onResize();
  },
});

export function onCleanup() {
  scene.onCleanup();
  autoResizer.detach();
  root.destroy();
}
