import tgpu from 'typegpu';

import * as c from './constants.ts';
import { defineControls } from '../../common/defineControls.ts';
import { setupScene } from './scene.ts';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const scene = await setupScene(root, context);

// #region Example controls and cleanup

export function onCleanup() {
  scene.onCleanup();
  root.destroy();
}

export const controls = defineControls({
  'glow intensity': {
    initial: c.INITIAL_GLOW_INTENSITY,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange(value) {
      scene.glowIntensity = value;
    },
  },
  'floor speed': {
    initial: 0.25,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange(value) {
      scene.floorSpeed = value;
    },
  },
  'sphere speed': {
    initial: 1,
    min: -10,
    max: 10,
    step: 0.1,
    onSliderChange(value) {
      scene.sphereSpeed = value;
    },
  },
  'sphere color': {
    initial: c.initialSphereColor,
    onColorChange: (value) => {
      scene.sphereColor = value;
    },
  },
  'floor pattern': {
    initial: 'circles',
    options: ['grid', 'circles'],
    onSelectChange: (value) => {
      scene.floorPattern = value;
    },
  },
});

// #endregion
