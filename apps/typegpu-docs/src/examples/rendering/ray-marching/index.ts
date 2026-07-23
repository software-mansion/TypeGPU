import tgpu from 'typegpu';

import { setupScene } from './scene.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const scene = await setupScene(root, context);

export function onCleanup() {
  scene.onCleanup();
  root.destroy();
}
