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
    // Keeping the aspect ratio 1:1
    const size = Math.min(canvas.width, canvas.height);
    canvas.width = size;
    canvas.height = size;
    scene.onResize();
  },
});

// #region Example controls and cleanup

export const controls = defineControls({
  'tile density': {
    initial: 10,
    min: 5,
    max: 20,
    step: 1,
    onSliderChange: (density) => {
      scene.tileDensity = density;
    },
  },
});

export function onCleanup() {
  scene.onCleanup();
  autoResizer.detach();
  root.destroy();
}

// #endregion
