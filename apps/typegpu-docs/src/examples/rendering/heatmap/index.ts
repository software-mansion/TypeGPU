import * as d from 'typegpu/data';

import { Plotter } from './prism/src/plotter.ts';
import { predefinedSurfaces } from './prism/src/surfaces.ts';
import { Scalers } from './prism/src/scalers.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const plotter = new Plotter(canvas);
await plotter.init();

plotter.addPlots(
  [
    predefinedSurfaces.logXZ,
  ],
  {
    xScaler: Scalers.MinMaxScaler,
    yScaler: Scalers.MinMaxScaler,
    zScaler: Scalers.MinMaxScaler,
    xZeroPlane: true,
    yZeroPlane: true,
    zZeroPlane: true,
    basePlanesTranslation: d.vec3f(0, -0.01, 0),
    basePlanesScale: d.vec3f(2.01),
    basePlotsTranslation: d.vec3f(),
    basePlotsScale: d.vec3f(2),
  },
);
plotter.startRenderLoop();
