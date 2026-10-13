import { tgpu, common } from 'typegpu';

import { defineControls } from '../../common/defineControls.ts';
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

// #region Example controls and cleanup

export const controls = defineControls({
  'Randomize positions': {
    onButtonClick: scene.randomizeFishPositions,
  },
});

export function onCleanup() {
  scene.onCleanup();
  autoResizer.detach();
  root.destroy();
}

// #endregion
