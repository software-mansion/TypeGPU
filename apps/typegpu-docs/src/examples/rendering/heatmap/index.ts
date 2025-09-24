import * as d from 'typegpu/data';

import { Plotter } from './lib/src/plotter.ts';

const canvas = document.querySelector('canvas') as HTMLCanvasElement;

const plotter = new Plotter(canvas);
await plotter.init();
plotter.plot([], {
  colormap: (y: number) => d.vec4f(1),
  xZeroPlane: true,
  yZeroPlane: true,
  zZeroPlane: true,
});
plotter.startRenderLoop();
