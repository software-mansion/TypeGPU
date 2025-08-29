import tgpu from 'typegpu';

import { Plotter } from './plotter.ts';
import { Executor } from './executor.ts';
import type { Distribution } from './types.ts';
import * as c from './constants.ts';
import { getCameraPosition, getPRNG } from './helpers.ts';

const root = await tgpu.init();

const executor = new Executor(root, c.initialNumSamples);
const plotter = new Plotter();

let currentDistribution = c.initialDistribution;
let replotFlag = false;

const replot = async (
  currentDistribution: Distribution,
  animate = false,
) => {
  replotFlag = true;
  try {
    let samples = undefined;
    const prng = getPRNG(currentDistribution);

    samples = await executor.executeMoreWorkers(prng.prng);
    plotter.plot(samples, prng, animate);
  } finally {
    replotFlag = false;
  }
};

// #region Example controls & Cleanup
const canvas = document.getElementById('canvas') as HTMLDivElement;
const helpInfo = document.getElementById('help') as HTMLDivElement;

canvas.addEventListener('contextmenu', (event) => event.preventDefault());
canvas.addEventListener('mouseover', () => {
  helpInfo.style.opacity = '0';
});
canvas.addEventListener('mouseout', () =>
  setTimeout(() => {
    helpInfo.style.opacity = '1';
  }, 5000));
// handle mobile devices
canvas.addEventListener('touchstart', () => {
  helpInfo.style.opacity = '0';
}, { passive: true });
canvas.addEventListener('touchend', () =>
  setTimeout(() => {
    helpInfo.style.opacity = '1';
  }, 5000));

export const controls = {
  'Reset Camera': {
    onButtonClick: () =>
      plotter.resetView(getCameraPosition(currentDistribution)),
  },
  'Distribution': {
    initial: c.initialDistribution,
    options: c.distributions,
    onSelectChange: async (value: Distribution) => {
      if (currentDistribution === value || replotFlag) {
        return;
      }

      currentDistribution = value;
      await replot(
        currentDistribution,
        true,
      );
      plotter.resetView(getCameraPosition(currentDistribution));
    },
  },
  'Number of samples': {
    initial: c.initialNumSamples,
    options: c.numSamplesOptions,
    onSelectChange: async (value: number) => {
      if (replotFlag) {
        return;
      }
      executor.count = value;
      await replot(
        currentDistribution,
      );
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
