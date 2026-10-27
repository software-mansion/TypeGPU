import { tgpu, common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';
import { hable, reinhard, aces, neutral, exposureAccess, srgbToLinear } from '@typegpu/color';

const root = await tgpu.init();
const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
const renderFormat = canvasFormat === 'bgra8unorm' ? 'bgra8unorm-srgb' : 'rgba8unorm-srgb';
const context = root.configureContext({
  canvas,
  format: canvasFormat,
  viewFormats: [renderFormat],
  alphaMode: 'premultiplied',
});

const tonemappingUniform = root.createUniform(d.u32, 0);
const pointLightColor = root.createUniform(d.vec3f, d.vec3f(1.0, 0.45, 0.075));
const pointLightScale = root.createUniform(d.f32, 0.2);
const pointLightPosition = root.createUniform(d.vec2f, d.vec2f(0.5));
const exposureUniform = root.createUniform(d.f32, 1);
const resolutionUniform = root.createUniform(d.vec2f, d.vec2f(canvas.width, canvas.height));

let sideBySide = false;

const getBrightness = (uv: d.v2f) => {
  'use gpu';
  const offset = uv - pointLightPosition.$;
  offset.x *= resolutionUniform.$.x / resolutionUniform.$.y;
  return pointLightScale.$ / std.length(offset);
};

const mainFragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  'use gpu';

  const brightness = getBrightness(uv);
  let color = srgbToLinear(pointLightColor.$) * brightness;

  switch (tonemappingUniform.$) {
    case 1:
      color = aces(color);
      break;
    case 2:
      color = hable(color);
      break;
    case 3:
      color = reinhard(color);
      break;
    case 4:
      color = neutral(color);
      break;
  }

  return d.vec4f(color, 1);
});

const mainRenderPipeline = root.with(exposureAccess, exposureUniform).createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: mainFragment,
  targets: { format: renderFormat },
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

  const brightness = getBrightness(localUV);
  let color = srgbToLinear(pointLightColor.$) * brightness;
  const tileIndex = d.i32(row) * columns + d.i32(column);

  switch (tileIndex) {
    case 0:
      break;
    case 1:
      color = aces(color);
      break;
    case 2:
      color = hable(color);
      break;
    case 3:
      color = reinhard(color);
      break;
    case 4:
      color = neutral(color);
      break;
    default:
      return d.vec4f(0);
  }

  if (tileIndex === d.i32(tonemappingUniform.$)) {
    const edgeDistance =
      (std.min(localUV, 1 - localUV) * resolutionUniform.$) / d.vec2f(columns, rows);
    if (std.min(edgeDistance.x, edgeDistance.y) < 2) {
      color = srgbToLinear(d.vec3f(0.443, 0.419, 0.973));
    }
  }

  return d.vec4f(color, 1);
});

const sideBySideRenderPipeline = root.with(exposureAccess, exposureUniform).createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment: sideBySideFragment,
  targets: { format: renderFormat },
});

let animationFrame: number;

function draw() {
  resolutionUniform.write(d.vec2f(canvas.width, canvas.height));
  const renderPipeline = sideBySide ? sideBySideRenderPipeline : mainRenderPipeline;

  const view = context.getCurrentTexture().createView({ format: renderFormat });
  renderPipeline.withColorAttachment({ view }).draw(3);

  animationFrame = requestAnimationFrame(draw);
}

animationFrame = requestAnimationFrame(draw);

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
  'Point Light Position': {
    initial: d.vec2f(0.5),
    min: d.vec2f(0),
    max: d.vec2f(1),
    step: d.vec2f(0.01),
    onVectorSliderChange: (value: d.v2f) => {
      pointLightPosition.write(value);
    },
  },
  'Side by Side': {
    initial: false,
    onToggleChange: (value: boolean) => {
      sideBySide = value;
    },
  },
  Exposure: {
    initial: 1,
    min: 0,
    max: 3,
    step: 0.01,
    onSliderChange: (value: number) => {
      exposureUniform.write(value);
    },
  },
});

export function onCleanup() {
  cancelAnimationFrame(animationFrame);
  root.destroy();
}
