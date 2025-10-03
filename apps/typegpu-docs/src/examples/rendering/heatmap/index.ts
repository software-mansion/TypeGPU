// import * as d from 'typegpu/data';

import { Plotter } from './prism/src/plotter.ts';
import { predefinedSurfaces } from './prism/src/surfaces.ts';
import { Scalers } from './prism/src/scalers.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const plotter = new Plotter(canvas);
await plotter.init();

// const mountains = predefinedSurfaces.mistyMountains;
// mountains.gridConfig = {
//   ...mountains.gridConfig,
//   colorCallback: (y: number) => d.vec4f(0.8, 0.5, 0, 0.8),
// };
// const log = predefinedSurfaces.logXZ;
// log.gridConfig = {
//   ...log.gridConfig,
//   colorCallback: (y: number) => d.vec4f(0, 0.8, 0.7, 0.8),
// };

plotter.addPlots(
  [
    predefinedSurfaces.normal,
  ],
  {
    xZeroPlane: true,
    yZeroPlane: true,
    zZeroPlane: true,
    xScaler: Scalers.MinMaxScaler,
    yScaler: {
      fit: (data: number[]) => {
        const { offset, scale } = Scalers.SignPreservingScaler.fit(data);
        return { offset, scale: scale * 2 };
      },
    },
    zScaler: Scalers.MinMaxScaler,
  },
);
plotter.startRenderLoop();
