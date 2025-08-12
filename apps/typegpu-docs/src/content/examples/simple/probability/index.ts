import * as MorphCharts from 'morphcharts';

// Core
const core = new MorphCharts.Core({
  container: document.getElementById('scatter') as HTMLElement,
});

core.config.logLevel = MorphCharts.LogLevel.trace;
const debug = document.getElementById('debug') as HTMLElement;
core.updateCallback = () => {
  debug.innerText = core.debugText.text;
};

// Renderer
const main = new MorphCharts.Renderers.Basic.Main();
main.depthEnabled = true;
core.renderer = main;

// Data
const count = 10000;
const ids = new Uint32Array(count);
const positionsX = new Float64Array(count);
const positionsY = new Float64Array(count);
const positionsZ = new Float64Array(count);
const sizes = new Float64Array(count);
const dists = new Float64Array(count);
for (let i = 0; i < count; i++) {
  ids[i] = i;
  positionsX[i] = Math.random();
  positionsY[i] = Math.random();
  positionsZ[i] = Math.random();
  sizes[i] = 0.17;
  dists[i] = Math.sqrt(
    (positionsX[i] - 0.5) ** 2 + (positionsY[i] - 0.5) ** 2 +
      (positionsZ[i] - 0.5) ** 2,
  );
}

// Palette
const palette = MorphCharts.Helpers.PaletteHelper.resample(
  core.paletteResources.palettes[
    MorphCharts.PaletteName.blues
  ].colors,
  16,
  false,
);

// Transition buffer
const transitionBuffer = core.renderer.createTransitionBuffer(ids);
core.renderer.transitionBuffers = [transitionBuffer];
transitionBuffer.currentBuffer.unitType = MorphCharts.UnitType.sphere;
transitionBuffer.currentPalette.colors = palette;

// Layout
const scatter = new MorphCharts.Layouts.Scatter(core);
scatter.layout(transitionBuffer.currentBuffer, ids, {
  positionsX: positionsX,
  positionsY: positionsY,
  positionsZ: positionsZ,
});
scatter.update(transitionBuffer.currentBuffer, ids, {
  sizes: sizes,
  sizeScaling: 0.1,
  colors: dists,
});

// Axes
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

// Alt-azimuth camera
const camera = core.camera;
camera.setPosition([0, 0, 0.2], false);
