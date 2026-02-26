import * as MorphCharts from 'morphcharts';
import type * as d from 'typegpu/data';
import * as std from 'typegpu/std';

import {
  type GeometricData,
  type GeometricPRNG,
  type HistogramData,
  PlotType,
  type PRNG,
} from './types.ts';
import * as c from './constants.ts';

// general
const defaultColorSpread = 32;
const defaultMinValue = -10;
const defaultMaxValue = 10;
const heightToBase = 7;
const transitionTime = 500; // milliseconds
const defaultStaggering = 0.7;
const defaultAxesSwapMoment = 1;

// geometric
const defaultSize = 0.17;

export class Plotter {
  readonly #core;
  readonly #palette;
  #transitionBuffer: MorphCharts.ITransitionBufferVisual | undefined =
    undefined;
  #count = 0;

  constructor() {
    this.#core = new MorphCharts.Core({
      container: document.getElementById('canvas') as HTMLDivElement,
    });
    this.#core.renderer = new MorphCharts.Renderers.Basic.Main();
    this.#palette = MorphCharts.Helpers.PaletteHelper.resample(
      this.#core.paletteResources.palettes[
        MorphCharts.PaletteName.purples
      ].colors,
      defaultColorSpread,
      false,
    );
    this.#core.config.transitionStaggering = defaultStaggering;
    this.#core.renderer.transitionTime = 1; // it is number from [0, 1] indicating the state of the animation - 1 means current
  }

  destroy() {
    this.#core.stop();
  }

  async plot(samples: d.v3f[], prng: PRNG, animate = false): Promise<void> {
    let needNewBuffer = false;
    if (samples.length !== this.#count) {
      this.#count = samples.length;
      needNewBuffer = true;
    }

    switch (prng.plotType) {
      case PlotType.GEOMETRIC:
        {
          const data = this.#prepareGeometricData(
            samples,
            prng as GeometricPRNG,
          );

          await this.#handlePlotting(
            () => this.#plotGeometric(data, this.#core, needNewBuffer),
            animate,
            needNewBuffer,
          );
        }
        break;
      case PlotType.CONTINUOUS:
        {
          const data = this.#prepareContinuousData(samples);

          await this.#handlePlotting(
            () => this.#plotHistogram(data, this.#core, false, needNewBuffer),
            animate,
            needNewBuffer,
          );
        }
        break;
      case PlotType.DISCRETE:
        {
          const data = this.#prepareDiscreteData(samples);

          await this.#handlePlotting(
            () => this.#plotHistogram(data, this.#core, true, needNewBuffer),
            animate,
            needNewBuffer,
          );
        }
        break;
    }
  }

  async #handlePlotting(
    subplotter: () => void,
    animate: boolean,
    needNewBuffer: boolean,
  ): Promise<void> {
    if (animate && !needNewBuffer) {
      this.#makeRoomForNewPlot();
    }

    subplotter();

    if (animate && !needNewBuffer) {
      await this.#distributionsTransition();
    }
  }

  resetView(cameraPos: number[]) {
    this.resetRotation();
    this.resetCamera(cameraPos);
  }

  resetRotation() {
    this.#core.reset(true);
    (this.#core.camera as MorphCharts.Cameras.AltAzimuthCamera).setAltAzimuth(
      MorphCharts.Helpers.AngleHelper.degreesToRadians(c.initialCameraAngle),
      0,
      true,
    );
  }

  resetCamera(cameraPos: number[]) {
    this.#core.camera.setPosition(cameraPos, true);
  }

  #makeRoomForNewPlot() {
    (this.#transitionBuffer as MorphCharts.ITransitionBufferVisual).swap();
    this.#core.renderer.transitionTime = 0; // it is number from [0, 1] indicating the state of the animation - 0 means previous
    this.#core.renderer.axesVisibility = MorphCharts.AxesVisibility.none;
  }

  #distributionsTransition(): Promise<void> {
    return new Promise((resolve) => {
      const start = performance.now();
      const animateTransition = (time: number) => {
        const duration = time - start;

        this.#core.renderer.transitionTime = std.clamp(
          duration / transitionTime,
          0,
          1,
        );

        this.#core.renderer.axesVisibility =
          this.#core.renderer.transitionTime < defaultAxesSwapMoment
            ? MorphCharts.AxesVisibility.none
            : MorphCharts.AxesVisibility.current;

        if (duration < transitionTime) {
          requestAnimationFrame(animateTransition);
        } else {
          resolve();
          return;
        }
      };
      requestAnimationFrame(animateTransition);
    });
  }

  #prepareGeometricData(samples: d.v3f[], prng: GeometricPRNG): GeometricData {
    const data: GeometricData = {
      count: this.#count,
      ids: new Uint32Array(this.#count),
      positionsX: new Float64Array(this.#count),
      positionsY: new Float64Array(this.#count),
      positionsZ: new Float64Array(this.#count),
      sizes: new Float64Array(this.#count),
      dists: new Float64Array(this.#count),
    };

    const origin = prng.origin;

    for (let i = 0; i < this.#count; i++) {
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

    return data;
  }

  #plotGeometric(
    data: GeometricData,
    core: MorphCharts.Core,
    needNewBuffer: boolean,
  ) {
    if (this.#transitionBuffer === undefined || needNewBuffer) {
      this.#transitionBuffer = this.#core.renderer.createTransitionBuffer(
        data.ids,
      );
    }

    this.#core.renderer.transitionBuffers = [this.#transitionBuffer];
    this.#transitionBuffer.currentBuffer.unitType = MorphCharts.UnitType.sphere;
    this.#transitionBuffer.currentPalette.colors = this.#palette;

    const scatter = new MorphCharts.Layouts.Scatter(this.#core);
    scatter.layout(this.#transitionBuffer.currentBuffer, data.ids, {
      positionsX: data.positionsX,
      positionsY: data.positionsY,
      positionsZ: data.positionsZ,
    });
    scatter.update(this.#transitionBuffer.currentBuffer, data.ids, {
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

  #prepareContinuousData(samples: d.v3f[]): HistogramData {
    // if we want to animate the transition between the old and new plots,
    // we need to have the same number of samples,
    // that's why I clamp them instead of filtering
    const samplesFiltered = samples.map((
      sample,
    ) => (std.clamp(sample.x, defaultMinValue, defaultMaxValue)));

    const { minSample, maxSample } = samplesFiltered.reduce(
      (acc, sample) => ({
        minSample: Math.min(acc.minSample, sample),
        maxSample: Math.max(acc.maxSample, sample),
      }),
      {
        minSample: Number.POSITIVE_INFINITY,
        maxSample: Number.NEGATIVE_INFINITY,
      },
    );

    const optimalBinCount = 2 * Math.ceil(Math.log2(this.#count)) + 1; // always odd
    const binXWidth = (maxSample - minSample) / optimalBinCount;

    const data: HistogramData = {
      count: this.#count,
      ids: new Uint32Array(this.#count),
      binIdsX: new Uint32Array(this.#count),
      binIdsZ: new Uint32Array(this.#count),
      values: new Float64Array(this.#count),
      binsX: optimalBinCount,
      binsZ: 1,
      binsWidth: binXWidth,
      sizeX: 1,
      sizeZ: 1,
      minX: minSample,
      maxX: maxSample,
    };

    const binSizes = new Uint32Array(optimalBinCount);
    binSizes.fill(0);

    for (let i = 0; i < this.#count; i++) {
      data.ids[i] = i;
      data.binIdsZ[i] = 0;
      data.binIdsX[i] = Math.min(
        Math.floor((samplesFiltered[i] - minSample) / binXWidth),
        optimalBinCount - 1,
      );
      binSizes[data.binIdsX[i]]++;
    }

    const maxBinCount = binSizes.reduce(
      (acc, size) => Math.max(acc, size),
      0,
    );
    for (let i = 0; i < this.#count; i++) {
      data.values[i] = binSizes[data.binIdsX[i]] / maxBinCount;
    }

    const guessedBinXZSize = Math.floor(
      (maxBinCount / heightToBase) ** (1 / 3),
    );
    data.sizeX = guessedBinXZSize;
    data.sizeZ = guessedBinXZSize;

    return data;
  }

  #prepareDiscreteData(samples: d.v3f[]): HistogramData {
    const samplesRounded = samples.map((sample) => Math.round(sample.x));

    const uniqueValues = samplesRounded.reduce((map, value) => {
      map.set(value, (map.get(value) || 0) + 1);
      return map;
    }, new Map());

    const { minValue, maxValue } = [...uniqueValues.keys()].reduce(
      (acc, value) => ({
        minValue: Math.min(acc.minValue, value),
        maxValue: Math.max(acc.maxValue, value),
      }),
      {
        minValue: Number.POSITIVE_INFINITY,
        maxValue: Number.NEGATIVE_INFINITY,
      },
    );

    const uniqueRange = maxValue - minValue + 1;

    const data: HistogramData = {
      count: this.#count,
      ids: new Uint32Array(this.#count),
      binIdsX: new Uint32Array(this.#count),
      binIdsZ: new Uint32Array(this.#count),
      values: new Float64Array(this.#count),
      binsX: uniqueRange,
      binsZ: 1,
      binsWidth: 1,
      sizeX: 1,
      sizeZ: 1,
      minX: minValue,
      maxX: maxValue,
    };

    const dominantFreq = uniqueValues.values().reduce(
      (acc, freq) => Math.max(acc, freq),
      0,
    );

    for (let i = 0; i < this.#count; i++) {
      data.ids[i] = i;
      data.binIdsZ[i] = 0;
      data.binIdsX[i] = samplesRounded[i] - minValue;
      data.values[i] = (uniqueValues.get(samplesRounded[i]) as number) /
        dominantFreq;
    }

    const guessedBinXZSize = Math.floor(
      (dominantFreq / heightToBase) ** (1 / 3),
    );
    data.sizeX = guessedBinXZSize;
    data.sizeZ = guessedBinXZSize;

    return data;
  }

  #plotHistogram(
    data: HistogramData,
    core: MorphCharts.Core,
    isDiscreteX: boolean,
    needNewBuffer: boolean,
  ) {
    if (this.#transitionBuffer === undefined || needNewBuffer) {
      this.#transitionBuffer = this.#core.renderer.createTransitionBuffer(
        data.ids,
      );
    }

    core.renderer.transitionBuffers = [this.#transitionBuffer];
    this.#transitionBuffer.currentBuffer.unitType = MorphCharts.UnitType.block;
    this.#transitionBuffer.currentPalette.colors = this.#palette;

    const stack = new MorphCharts.Layouts.Stack(core);
    stack.layout(this.#transitionBuffer.currentBuffer, data.ids, {
      binsX: data.binsX,
      binsZ: data.binsZ,
      binIdsX: data.binIdsX,
      binIdsZ: data.binIdsZ,
      sizeX: data.sizeX,
      sizeZ: data.sizeZ,
      spacingX: 1,
      spacingZ: 1,
    });
    stack.update(this.#transitionBuffer.currentBuffer, data.ids, {
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
      titleY: 'count',
      titleZ: '',
      isDiscreteX,
      isDiscreteZ: true,
      labelsX: (value) => {
        return (value * data.binsWidth + data.minX).toFixed(isDiscreteX ? 0 : 1)
          .toString();
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
