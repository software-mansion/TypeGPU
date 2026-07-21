import tgpu from 'typegpu';

import { defineControls } from '../../common/defineControls.ts';
import { setupScene } from './scene.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const scene = await setupScene(root, context);

// #region Example controls and cleanup

export const controls = defineControls({
  'Randomize positions': {
    onButtonClick: scene.randomizeFishPositions,
  },
});

export function onCleanup() {
  scene.onCleanup();
  root.destroy();
}

// #endregion
