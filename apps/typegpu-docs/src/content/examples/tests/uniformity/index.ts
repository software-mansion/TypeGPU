import tgpu from 'typegpu';

import * as c from './constants.ts';
import type { PRNG } from './prngs.ts';
import { executePipeline } from './helpers.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

// #region Example controls & Cleanup

export const controls = {
  'PRNG': {
    initial: c.initialPRNG,
    options: c.prngs,
    onSelectChange: async (value: PRNG) =>
      executePipeline(root, context, value),
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
