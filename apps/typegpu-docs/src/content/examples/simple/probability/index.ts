import tgpu from 'typegpu';

import { Plotter } from './plotter.ts';
import { Executor } from './executor.ts';
import type { Distribution, Generator } from './types.ts';
import * as c from './constants.ts';
import { getCameraPosition, getGenerator, getPRNG } from './helpers.ts';

const root = await tgpu.init();

const executor = new Executor(root, c.initialNumSamples);
const plotter = new Plotter();

let currentDistribution = c.initialDistribution;
let currentGenerator = c.initialGenerator;

const replot = async (
  currentDistribution: Distribution,
  currentGenerator: Generator,
  animate = false,
) => {
  let samples = undefined;
  const prng = getPRNG(currentDistribution);

  samples = await executor.executeMoreWorkers(
    prng.prng,
    getGenerator(currentGenerator),
  );
  plotter.plot(samples, prng, animate);
  plotter.resetView(getCameraPosition(currentDistribution));
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
  }, c.cooldown));
// handle mobile devices
canvas.addEventListener('touchstart', () => {
  helpInfo.style.opacity = '0';
}, { passive: true });
canvas.addEventListener('touchend', () =>
  setTimeout(() => {
    helpInfo.style.opacity = '1';
  }, c.cooldown));

export const controls = {
  'Reset Camera': {
    onButtonClick: () =>
      plotter.resetView(getCameraPosition(currentDistribution)),
  },
  'Generator': {
    initial: c.initialGenerator,
    options: c.generators,
    onSelectChange: async (value: Generator) => {
      if (currentGenerator === value) {
        return;
      }

      currentGenerator = value;
      await replot(
        currentDistribution,
        currentGenerator,
        true,
      );
      plotter.resetView(getCameraPosition(currentDistribution));
    },
  },
  'Distribution': {
    initial: c.initialDistribution,
    options: c.distributions,
    onSelectChange: async (value: Distribution) => {
      if (currentDistribution === value) {
        return;
      }

      currentDistribution = value;
      await replot(
        currentDistribution,
        currentGenerator,
        true,
      );
      plotter.resetView(getCameraPosition(currentDistribution));
    },
  },
  'Number of samples': {
    initial: c.initialNumSamples,
    options: c.numSamplesOptions,
    onSelectChange: async (value: number) => {
      executor.count = value;
      await replot(
        currentDistribution,
        currentGenerator,
      );
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
