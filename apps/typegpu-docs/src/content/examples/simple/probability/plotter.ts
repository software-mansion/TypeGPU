import * as MorphCharts from 'morphcharts';
import type * as d from 'typegpu/data';

import {
  type GeometricData,
  type GeometricPRNG,
  type HistogramData,
  PlotType,
  type PRNG,
} from './types.ts';
import * as c from './constants.ts';

// general
const defaultColorSpread = 16;
const defaultMinValue = -10;
const defaultMaxValue = 10;

// geometric
const defaultSize = 0.17;

// histogram
const defaultSizeX = 5;
const defaultSizeZ = 5;

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
      defaultColorSpread,
      false,
    );
  }

  plot(samples: d.v3f[], prng: PRNG) {
    switch (prng.plotType) {
      case PlotType.GEOMETRIC:
        {
          const count = samples.length;
          const data: GeometricData = {
            count,
            ids: new Uint32Array(count),
            positionsX: new Float64Array(count),
            positionsY: new Float64Array(count),
            positionsZ: new Float64Array(count),
            sizes: new Float64Array(count),
            dists: new Float64Array(count),
          };

          const origin = (prng as GeometricPRNG).origin;

          for (let i = 0; i < count; i++) {
            data.ids[i] = i;
            data.positionsX[i] = samples[i].x;
            data.positionsY[i] = samples[i].y;
            data.positionsZ[i] = samples[i].z;
            data.sizes[i] = defaultSize;
            data.dists[i] = Math.sqrt(
              (data.positionsX[i] - origin.x) ** 2 +
                (data.positionsY[i] - origin.y) ** 2 +
                (data.positionsZ[i] - origin.z) ** 2,
            );
          }

          this.#plotGeometric(data, this.#core);
        }
        break;
      case PlotType.HISTOGRAM:
        {
          const samplesFiltered = samples.filter((sample) =>
            sample.x >= defaultMinValue && sample.x <= defaultMaxValue
          );
          const count = samplesFiltered.length;

          const minSample = samplesFiltered.reduce(
            (a, b) => Math.min(a, b.x),
            Number.POSITIVE_INFINITY,
          );
          const maxSample = samplesFiltered.reduce(
            (a, b) => Math.max(a, b.x),
            Number.NEGATIVE_INFINITY,
          );

          const optimalBinCount = Math.ceil(Math.log2(count)) + 1;
          const binXWidth = (maxSample - minSample) / optimalBinCount;

          const data: HistogramData = {
            count,
            ids: new Uint32Array(count),
            binIdsX: new Uint32Array(count),
            binIdsZ: new Uint32Array(count),
            values: new Float64Array(count),
            binsX: optimalBinCount,
            binsZ: 1,
            binsWidth: binXWidth,
            sizeX: defaultSizeX,
            sizeZ: defaultSizeZ,
            minX: minSample,
            maxX: maxSample,
          };

          const binSizes = new Uint32Array(optimalBinCount);
          binSizes.fill(0);

          for (let i = 0; i < count; i++) {
            data.ids[i] = i;
            data.binIdsZ[i] = 0;
            data.binIdsX[i] = Math.min(
              Math.floor((samplesFiltered[i].x - minSample) / binXWidth),
              optimalBinCount - 1,
            );
            binSizes[data.binIdsX[i]]++;
          }

          const maxBinCount = binSizes.reduce((a, b) => Math.max(a, b), 0);
          for (let i = 0; i < count; i++) {
            data.values[i] = binSizes[data.binIdsX[i]] / maxBinCount;
          }

          this.#plotHistogram(data, this.#core);
        }
        break;
    }
  }

  resetView() {
    this.resetRotation();
    this.resetCamera();
  }

  resetRotation() {
    this.#core.reset(true);
    (this.#core.camera as MorphCharts.Cameras.AltAzimuthCamera).setAltAzimuth(
      MorphCharts.Helpers.AngleHelper.degreesToRadians(c.initialCameraAngle),
      0,
      true,
    );
  }

  resetCamera() {
    this.#core.camera.setPosition(c.initialCameraPosition, true);
  }

  #plotGeometric(data: GeometricData, core: MorphCharts.Core) {
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
    const axes = MorphCharts.Axes.Cartesian3dAxesHelper.create(core, {
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
    });
    core.renderer.currentAxes = [
      core.renderer.createCartesian3dAxesVisual(axes),
    ];
  }

  #plotHistogram(data: HistogramData, core: MorphCharts.Core) {
    const transitionBuffer = core.renderer.createTransitionBuffer(data.ids);
    core.renderer.transitionBuffers = [transitionBuffer];
    transitionBuffer.currentBuffer.unitType = MorphCharts.UnitType.block;
    transitionBuffer.currentPalette.colors = this.#palette;

    const stack = new MorphCharts.Layouts.Stack(core);
    stack.layout(transitionBuffer.currentBuffer, data.ids, {
      binsX: data.binsX,
      binsZ: data.binsZ,
      binIdsX: data.binIdsX,
      binIdsZ: data.binIdsZ,
      sizeX: data.sizeX,
      sizeZ: data.sizeZ,
      spacingX: 1,
      spacingZ: 1,
    });
    stack.update(transitionBuffer.currentBuffer, data.ids, {
      colors: data.values,
      padding: 0.025,
    });

    const axes = MorphCharts.Axes.Cartesian3dAxesHelper.create(core, {
      minBoundsX: stack.minModelBoundsX,
      minBoundsY: stack.minModelBoundsY,
      minBoundsZ: stack.minModelBoundsZ,
      maxBoundsX: stack.maxModelBoundsX,
      maxBoundsY: stack.maxModelBoundsY,
      maxBoundsZ: stack.maxModelBoundsZ,
      minValueX: 0,
      maxValueX: data.binsX - 1,
      minValueY: 0,
      maxValueY: stack.maxLevel * data.sizeX * data.sizeZ,
      minValueZ: 0,
      maxValueZ: data.binsZ - 1,
      titleX: 'x',
      titleY: 'y',
      titleZ: 'z',
      isDiscreteZ: true,
      labelsX: (value) => {
        return (value * data.binsWidth + data.minX).toFixed(1).toString();
      },
      labelsY: (value) => {
        return Math.round(value).toString();
      },
      labelsZ: (value) => {
        return value.toString();
      },
    });

    axes.zero[0] = -1;
    axes.zero[2] = -1;
    core.renderer.currentAxes = [
      core.renderer.createCartesian3dAxesVisual(axes),
    ];
  }
}
