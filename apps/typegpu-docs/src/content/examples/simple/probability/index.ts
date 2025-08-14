import tgpu from 'typegpu';
import { randf } from '@typegpu/noise';
import * as d from 'typegpu/data';

import { Plotter } from './plotter.ts';
import { Executor } from './executor.ts';
import { type Distributions, PlotType } from './types.ts';

const root = await tgpu.init();
const count = 10000;

const executor = new Executor(root, count);
const plotter = new Plotter();

// #region Example controls & Cleanup

export const controls = {
  'Reset camera': { onButtonClick: () => plotter.resetCamera() },
  'Distribution': {
    initial: 'onUnitSphere',
    options: ['onUnitSphere', 'inUnitSphere'],
    onSelectChange: async (value: Distributions) => {
      let samples = undefined;
      let title = undefined;
      switch (value) {
        case 'onUnitSphere': {
          samples = await executor.executeSingleWorker(randf.onUnitSphere);
          title = 'Samples on Unit Sphere';
          break;
        }
        case 'inUnitSphere': {
          samples = await executor.executeSingleWorker(randf.inUnitSphere);
          title = 'Samples in Unit Sphere';
          break;
        }
      }

      plotter.plot(samples, PlotType.GEOMETRIC, d.vec3f(), title);
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
