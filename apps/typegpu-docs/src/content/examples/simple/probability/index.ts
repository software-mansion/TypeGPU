import tgpu from 'typegpu';
import { randf } from '@typegpu/noise';
import * as d from 'typegpu/data';

import { Plotter } from './plotter.ts';
import { Executor } from './executor.ts';
import { type Distributions, PlotType } from './types.ts';
import * as c from './constants.ts';

const root = await tgpu.init();

const executor = new Executor(root, c.initialNumSamples);
const plotter = new Plotter();

let currentDistribution = c.initialDistribution;

const replot = async (distribution: Distributions) => {
  let samples = undefined;
  switch (distribution) {
    case 'onUnitSphere': {
      samples = await executor.executeSingleWorker(randf.onUnitSphere);
      break;
    }
    case 'inUnitSphere': {
      samples = await executor.executeSingleWorker(randf.inUnitSphere);
      break;
    }
  }

  plotter.plot(samples, PlotType.GEOMETRIC, d.vec3f());
};

// #region Example controls & Cleanup

export const controls = {
  'Reset': {
    onButtonClick: () => {
      plotter.resetRotation();
      plotter.resetCamera();
    },
  },
  'Distribution': {
    initial: c.initialDistribution,
    options: c.distributions,
    onSelectChange: async (value: Distributions) => {
      currentDistribution = value;
      await replot(value);
    },
  },
  'Number of samples': {
    initial: c.initialNumSamples,
    min: 100,
    max: 65000,
    step: 100,
    onSliderChange: async (value: number) => {
      executor.count = value;
      await replot(currentDistribution);
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
