import tgpu, { common, d, std } from 'typegpu';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const spanUniform = root.createUniform(d.vec2f);

const fragment = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const red = std.floor(uv.x * spanUniform.$.x) / spanUniform.$.x;
  const green = std.floor(uv.y * spanUniform.$.y) / spanUniform.$.y;
  return d.vec4f(red, green, 0.5, 1.0);
});

const pipeline = root.createRenderPipeline({
  vertex: common.fullScreenTriangle,
  fragment,
  targets: { format: presentationFormat },
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });

function draw(spanXValue: number, spanYValue: number) {
  spanUniform.write(d.vec2f(spanXValue, spanYValue));

  pipeline.withColorAttachment({ view: context }).draw(3);
}

let spanX = 10;
let spanY = 10;

draw(spanX, spanY);

// #region Example controls and cleanup

export const controls = defineControls({
  'x span ↔️': {
    initial: spanX,
    min: 0,
    max: 20,
    step: 1,
    onSliderChange: (newValue) => {
      spanX = newValue;
      draw(spanX, spanY);
    },
  },

  'y span ↕️': {
    initial: spanY,
    min: 0,
    max: 20,
    step: 1,
    onSliderChange: (newValue) => {
      spanY = newValue;
      draw(spanX, spanY);
    },
  },
});

export function onCleanup() {
  root.destroy();
}

// #endregion
