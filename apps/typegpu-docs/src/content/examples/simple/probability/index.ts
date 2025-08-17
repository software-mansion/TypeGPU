import tgpu from 'typegpu';
import * as d from 'typegpu/data';

import { Plotter } from './plotter.ts';
import { Executor } from './executor.ts';
import { type Distribution, ExecutionMode, PlotType } from './types.ts';
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

  samples = await verdict(prng);
  plotter.plot(samples, PlotType.GEOMETRIC, d.vec3f());
};

// #region Example controls & Cleanup

export const controls = {
  'Reset': {
    // camera with num of samples
  },
  'Reset Camera': {
    onButtonClick: () => {
      plotter.resetRotation();
      plotter.resetCamera();
    },
  },
  'Execution Mode': {
    initial: c.initialExecutionMode,
    options: c.executionModes,
    onSelectChange: async (value: ExecutionMode) => {
      currentExecutionMode = value;
      await replot(currentDistribution, currentExecutionMode);
      plotter.resetRotation();
      plotter.resetCamera();
    },
  },
  'Distribution': {
    initial: c.initialDistribution,
    options: c.distributions,
    onSelectChange: async (value: Distribution) => {
      currentDistribution = value;
      await replot(currentDistribution, currentExecutionMode);
      plotter.resetRotation();
      plotter.resetCamera();
    },
  },
  'Number of samples': {
    initial: c.initialNumSamples,
    min: 0,
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
