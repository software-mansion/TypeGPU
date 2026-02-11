import tgpu from 'typegpu';

import { Plotter } from './plotter.ts';
import { Executor } from './executor.ts';
import type { Distribution } from './types.ts';
import * as c from './constants.ts';
import { getCameraPosition, getPRNG } from './helpers.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();

const executor = new Executor(root);
const plotter = new Plotter();

let currentDistribution = c.initialDistribution;

const replot = async (
  currentDistribution: Distribution,
  animate = false,
) => {
  const prng = getPRNG(currentDistribution);

  const samples = await executor.executeMoreWorkers(prng.prng);
  await plotter.plot(samples, prng, animate);
};

// #region Example controls & Cleanup
const canvas = document.getElementById('canvas') as HTMLDivElement;
const helpInfo = document.getElementById('help') as HTMLDivElement;

canvas.addEventListener('contextmenu', (event) => event.preventDefault());

canvas.addEventListener('mouseover', () => {
  helpInfo.style.opacity = '0';
});

canvas.addEventListener('mouseout', () => {
  setTimeout(() => {
    helpInfo.style.opacity = '1';
  }, c.popupCooldown);
});

// handle mobile devices

canvas.addEventListener('touchstart', () => {
  helpInfo.style.opacity = '0';
}, { passive: true });

canvas.addEventListener('touchend', () => {
  setTimeout(() => {
    helpInfo.style.opacity = '1';
  }, c.popupCooldown);
});

plotter.resetView(getCameraPosition(currentDistribution));

export const controls = defineControls({
  'Reset Camera': {
    onButtonClick: () => {
      plotter.resetView(getCameraPosition(currentDistribution));
    },
  },
  'Reseed': {
    async onButtonClick() {
      executor.reseed();
      await replot(currentDistribution, true);
      plotter.resetView(getCameraPosition(currentDistribution));
    },
  },
  'Distribution': {
    initial: c.initialDistribution,
    options: c.distributions,
    async onSelectChange(value) {
      if (currentDistribution === value) {
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
    async onSelectChange(value) {
      executor.count = value;
      await replot(
        currentDistribution,
      );
    },
  },
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick() {
      c.distributions
        .map((dist) =>
          tgpu.resolve([executor.cachedPipeline(getPRNG(dist).prng)])
        )
        .map((r) => root.device.createShaderModule({ code: r }));
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
