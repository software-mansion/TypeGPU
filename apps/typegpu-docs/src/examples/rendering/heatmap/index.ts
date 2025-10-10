import * as d from 'typegpu/data';

import { Plotter } from './prism/src/plotter.ts';
import { predefinedSurfaces } from './prism/src/examples/surfaces.ts';
import { Scalers } from './prism/src/scalers.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const plotter = new Plotter(canvas);
await plotter.init();

plotter.addPlots(
  [
    predefinedSurfaces.normal,
  ],
  {
    xScaler: Scalers.MinMaxScaler,
    yScaler: Scalers.SignPreservingScaler,
    zScaler: Scalers.MinMaxScaler,
    xZeroPlane: false,
    zZeroPlane: false,
    yZeroPlane: true,
    topology: 'all',
    basePlanesTranslation: d.vec3f(0, -0.01, 0),
    basePlanesScale: d.vec3f(2.01),
    basePlotsTranslation: d.vec3f(),
    basePlotsScale: d.vec3f(2, 1, 2),
  },
);
plotter.startRenderLoop();
