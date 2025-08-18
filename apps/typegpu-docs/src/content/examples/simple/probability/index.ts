import tgpu from 'typegpu';

import { Plotter } from './plotter.ts';
import { Executor } from './executor.ts';
import { type Distribution, ExecutionMode } from './types.ts';
import * as c from './constants.ts';
import { getPRNG } from './helpers.ts';

const root = await tgpu.init();

const executor = new Executor(root, c.initialNumSamples);
const plotter = new Plotter();

let currentDistribution = c.initialDistribution;
let currentExecutionMode = c.initialExecutionMode;

const replot = async (distribution: Distribution, execMod: ExecutionMode) => {
  let samples = undefined;
  let verdict = undefined;
  const prng = getPRNG(distribution);

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

  samples = await verdict(prng.prng);
  plotter.plot(samples, prng.plotType, prng.origin);
};

// #region Example controls & Cleanup

export const controls = {
  'Reset Camera': {
    onButtonClick: () => {
      plotter.resetView();
    },
  },
  'Execution Mode': {
    initial: c.initialExecutionMode,
    options: c.executionModes,
    onSelectChange: async (value: ExecutionMode) => {
      currentExecutionMode = value;
      await replot(currentDistribution, currentExecutionMode);
      plotter.resetView();
    },
  },
  'Distribution': {
    initial: c.initialDistribution,
    options: c.distributions,
    onSelectChange: async (value: Distribution) => {
      currentDistribution = value;
      await replot(currentDistribution, currentExecutionMode);
      plotter.resetView();
    },
  },
  'Number of samples': {
    initial: c.initialNumSamples,
    min: 100,
    max: 65000,
    step: 100,
    onSliderChange: async (value: number) => {
      executor.count = value;
      await replot(currentDistribution, currentExecutionMode);
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
