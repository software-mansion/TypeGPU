import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { hable, reinhard, aces, neutral } from '@typegpu/color';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas });

const tonemappingUniform = root.createUniform(d.u32, 0);
const pointLightColor = root.createUniform(d.vec3f, d.vec3f(1.0, 0.45, 0.075));
const pointLightScale = root.createUniform(d.f32, 0.2);
const pointLightX = root.createUniform(d.f32, 0.5);
const pointLightY = root.createUniform(d.f32, 0.5);

let sideBySide = false;

const mainFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';

  const brightness = pointLightScale.$ / std.length(uv - d.vec2f(pointLightX.$, pointLightY.$));
  let color = pointLightColor.$ * brightness;

  if (tonemappingUniform.$ === 1) {
    color = aces(color);
  } else if (tonemappingUniform.$ === 2) {
    color = hable(color);
  } else if (tonemappingUniform.$ === 3) {
    color = reinhard(color);
  } else if (tonemappingUniform.$ === 4) {
    color = neutral(color);
  }

  return d.vec4f(color, 1.0);
});

const mainRenderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: mainFragment,
});

const sideBySideFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';

  const rows = 3;
  const columns = 3;
  const columnWidth = 1.0 / d.f32(columns);
  const rowHeight = 1.0 / d.f32(rows);

  const alignedUV = d.vec2f(uv.x, uv.y - rowHeight * 0.5);

  const column = d.f32(std.floor(alignedUV.x * d.f32(columns)));
  const row = d.f32(std.floor(alignedUV.y * d.f32(rows)));

  const localUV = d.vec2f(
    (alignedUV.x - column * columnWidth) / columnWidth,
    (alignedUV.y - row * rowHeight) / rowHeight,
  );

  const brightness =
    pointLightScale.$ / std.length(localUV - d.vec2f(pointLightX.$, pointLightY.$));
  let color = pointLightColor.$ * brightness;

  if (column === 0 && row === 0) {
    color = d.vec3f(color);
  } else if (column === 1 && row === 0) {
    color = aces(color);
  } else if (column === 2 && row === 0) {
    color = hable(color);
  } else if (column === 0 && row === 1) {
    color = reinhard(color);
  } else if (column === 1 && row === 1) {
    color = neutral(color);
  } else {
    color = d.vec3f(1.0);
  }

  return d.vec4f(color, 1.0);
});

const sideBySideRenderPipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: sideBySideFragment,
});

function draw() {
  const renderPipeline = sideBySide ? sideBySideRenderPipeline : mainRenderPipeline;

  renderPipeline.withColorAttachment({ view: context }).draw(3);

  requestAnimationFrame(draw);
}

requestAnimationFrame(draw);

export const controls = defineControls({
  'Tonemapping Mode': {
    initial: 'None',
    options: ['None', 'ACES', 'Hable', 'Reinhard', 'Neutral'],
    onSelectChange(value: string) {
      if (value === 'None') {
        tonemappingUniform.write(0);
      } else if (value === 'ACES') {
        tonemappingUniform.write(1);
      } else if (value === 'Hable') {
        tonemappingUniform.write(2);
      } else if (value === 'Reinhard') {
        tonemappingUniform.write(3);
      } else if (value === 'Neutral') {
        tonemappingUniform.write(4);
      }
    },
  },
  'Point Light Color': {
    initial: d.vec3f(1.0, 0.45, 0.075),
    onColorChange: (c) => {
      pointLightColor.write(c);
    },
  },
  'Point Light Scale': {
    initial: 0.2,
    min: 0.01,
    max: 2,
    step: 0.01,
    onSliderChange: (value: number) => {
      pointLightScale.write(value);
    },
  },
  'Point Light X': {
    initial: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value: number) => {
      pointLightX.write(value);
    },
  },
  'Point Light Y': {
    initial: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    onSliderChange: (value: number) => {
      pointLightY.write(value);
    },
  },
  'Side by Side': {
    initial: false,
    onToggleChange: (value: boolean) => {
      sideBySide = value;
    },
  },
});

export function onCleanup() {
  root.destroy();
}
