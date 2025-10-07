import * as d from 'typegpu/data';

import { Plotter } from './prism/src/plotter.ts';
import { predefinedSurfaces } from './prism/src/surfaces.ts';
import { Scalers } from './prism/src/scalers.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const plotter = new Plotter(canvas);
await plotter.init();

plotter.addPlots(
  [
    predefinedSurfaces.powerOfTwo,
  ],
  {
    xScaler: Scalers.IdentityScaler,
    yScaler: Scalers.LogScaler,
    zScaler: Scalers.IdentityScaler,
    xZeroPlane: false,
    yZeroPlane: false,
    zZeroPlane: false,
    basePlanesTranslation: d.vec3f(0, -0.01, 0),
    basePlanesScale: d.vec3f(8.01),
    basePlotsTranslation: d.vec3f(),
    basePlotsScale: d.vec3f(2),
  },
);
plotter.startRenderLoop();
