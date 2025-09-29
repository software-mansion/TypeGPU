import { Plotter } from './prism/src/plotter.ts';
import { predefinedSurfaces } from './prism/src/surfaces.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const plotter = new Plotter(canvas);
await plotter.init();
plotter.addPlots(
  [predefinedSurfaces.mistyMountains],
  {
    xZeroPlane: true,
    yZeroPlane: true,
    zZeroPlane: true,
  },
);
plotter.startRenderLoop();
