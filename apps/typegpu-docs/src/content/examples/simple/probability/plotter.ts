import * as MorphCharts from 'morphcharts';
import type * as d from 'typegpu/data';

import { PlotType } from './types.ts';
import type { PlotData } from './types.ts';
import * as c from './constants.ts';

export class Plotter {
  readonly #core;
  readonly #palette;

  constructor() {
    this.#core = new MorphCharts.Core({
      container: document.getElementById('canvas') as HTMLElement,
    });
    this.#core.renderer = new MorphCharts.Renderers.Basic.Main();
    this.#palette = MorphCharts.Helpers.PaletteHelper.resample(
      this.#core.paletteResources.palettes[
        MorphCharts.PaletteName.purples
      ].colors,
      64,
      false,
    );
  }

  plot(samples: d.v3f[], type: PlotType, origin: d.v3f) {
    const count = samples.length;
    const data: PlotData = {
      count,
      ids: new Uint32Array(count),
      positionsX: new Float64Array(count),
      positionsY: new Float64Array(count),
      positionsZ: new Float64Array(count),
      sizes: new Float64Array(count),
      dists: new Float64Array(count),
    };

    for (let i = 0; i < count; i++) {
      data.ids[i] = i;
      data.positionsX[i] = samples[i].x;
      data.positionsY[i] = samples[i].y;
      data.positionsZ[i] = samples[i].z;
      data.sizes[i] = 0.17;
      data.dists[i] = Math.sqrt(
        (data.positionsX[i] - origin.x) ** 2 +
          (data.positionsY[i] - origin.y) ** 2 +
          (data.positionsZ[i] - origin.z) ** 2,
      );
    }

    switch (type) {
      case PlotType.GEOMETRIC:
        this.#plotGeomteric(data, this.#core);
        break;
    }
  }

  resetRotation() {
    this.#core.reset(true);
  }

  resetCamera() {
    const camera = this.#core.camera;
    camera.setPosition(c.initialCameraPosition, true);
  }

  #plotGeomteric(data: PlotData, core: MorphCharts.Core) {
    const transitionBuffer = this.#core.renderer.createTransitionBuffer(
      data.ids,
    );
    this.#core.renderer.transitionBuffers = [transitionBuffer];
    transitionBuffer.currentBuffer.unitType = MorphCharts.UnitType.sphere;
    transitionBuffer.currentPalette.colors = this.#palette;
    const scatter = new MorphCharts.Layouts.Scatter(this.#core);
    scatter.layout(transitionBuffer.currentBuffer, data.ids, {
      positionsX: data.positionsX,
      positionsY: data.positionsY,
      positionsZ: data.positionsZ,
    });
    scatter.update(transitionBuffer.currentBuffer, data.ids, {
      sizes: data.sizes,
      sizeScaling: 0.1,
      colors: data.dists,
    });
    const axes = MorphCharts.Axes.Cartesian3dAxesHelper.create(
      core,
      {
        titleX: 'x',
        titleY: 'y',
        titleZ: 'z',
        labelsX: (value) => {
          return value.toFixed(1);
        },
        labelsY: (value) => {
          return value.toFixed(1);
        },
        labelsZ: (value) => {
          return value.toFixed(1);
        },
      },
    );
    core.renderer.currentAxes = [
      core.renderer.createCartesian3dAxesVisual(axes),
    ];
  }
}
