import * as MorphCharts from 'morphcharts';
import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import { randf } from '@typegpu/noise';
import { sqrt } from 'typegpu/std';

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

const root = await tgpu.init();
const b = root.createBuffer(d.arrayOf(d.vec3f, count)).$usage('storage');
const bView = b.as('mutable');

const f1 = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(() => {
  for (let i = d.i32(0); i < d.i32(count); i++) {
    bView.$[i] = d.vec3f(randf.inUnitSphere());
  }
});

const p1 = root['~unstable'].withCompute(f1).createPipeline();
p1.dispatchWorkgroups(1);
const samples1 = await b.read();

const f2 = tgpu['~unstable'].computeFn({
  in: { gid: d.builtin.globalInvocationId },
  workgroupSize: [1],
})((input) => {
  randf.seed2(d.vec2f(input.gid.xy));
  bView.$[input.gid.x * d.u32(sqrt(count)) + input.gid.y] = d.vec3f(
    randf.onUnitSphere(),
  );
});

const p2 = root['~unstable'].withCompute(f2).createPipeline();
p2.dispatchWorkgroups(d.u32(sqrt(count)), d.u32(sqrt(count)));
const samples2 = await b.read();

const buffer = samples1;

for (let i = 0; i < count; i++) {
  ids[i] = i;
  positionsX[i] = buffer[i].x;
  positionsY[i] = buffer[i].y;
  positionsZ[i] = buffer[i].z;
  sizes[i] = 0.17;
  dists[i] = Math.sqrt(
    (positionsX[i]) ** 2 + (positionsY[i]) ** 2 + (positionsZ[i] ** 2),
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
    minValueX: -1,
    minValueY: -1,
    // minValueZ: -1,
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
