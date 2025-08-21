import tgpu from 'typegpu';

import { Plotter } from './plotter.ts';
import { Executor } from './executor.ts';
import { type Distribution, ExecutionMode } from './types.ts';
import * as c from './constants.ts';
import { getCameraPosition, getPRNG } from './helpers.ts';

const root = await tgpu.init();

const executor = new Executor(root, c.initialNumSamples);
const plotter = new Plotter();

let currentDistribution = c.initialDistribution;
let currentExecutionMode = c.initialExecutionMode;

const replot = async (
  currentDistribution: Distribution,
  execMod: ExecutionMode,
  animate = false,
  forceReexec = false,
) => {
  let samples = undefined;
  let verdict = undefined;
  const prng = getPRNG(currentDistribution);

  switch (execMod) {
    case ExecutionMode.SINGLE: {
      verdict = executor.executeSingleWorker.bind(executor);
      break;
    }
    case ExecutionMode.PARALLEL: {
      verdict = executor.executeMoreWorkers.bind(executor);
      break;
    }
  }

  samples = await verdict(prng.prng, forceReexec);
  plotter.plot(samples, prng, animate);
};

await replot(currentDistribution, currentExecutionMode);
plotter.resetView(getCameraPosition(currentDistribution));

// #region Example controls & Cleanup
const canvas = document.getElementById('canvas') as HTMLDivElement;
const helpInfo = document.getElementById('help') as HTMLDivElement;

canvas.addEventListener('contextmenu', (event) => {
  event.preventDefault();
});
canvas.addEventListener('mouseover', () => {
  helpInfo.style.opacity = '0';
});
canvas.addEventListener('mouseout', () => {
  helpInfo.style.opacity = '1';
});
// handle mobile devices
canvas.addEventListener('touchstart', () => {
  helpInfo.style.opacity = '0';
});
canvas.addEventListener('touchend', () => {
  helpInfo.style.opacity = '1';
});

export const controls = {
  'Reset Camera': {
    onButtonClick: () => {
      plotter.resetView(getCameraPosition(currentDistribution));
    },
  },
  'Execution Mode': {
    initial: c.initialExecutionMode,
    options: c.executionModes,
    onSelectChange: async (value: ExecutionMode) => {
      if (currentExecutionMode === value) {
        return;
      }

      currentExecutionMode = value;
      await replot(currentDistribution, currentExecutionMode, false, true);
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
        currentExecutionMode,
        true,
        true,
      );
      plotter.resetView(getCameraPosition(currentDistribution));
    },
  },
  'Number of samples': {
    initial: c.initialNumSamples,
    options: c.numSamplesOptions,
    onSelectChange: async (value: number) => {
      if (value === executor.count) {
        return;
      }

      executor.count = value;
      await replot(
        currentDistribution,
        currentExecutionMode,
      );
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
