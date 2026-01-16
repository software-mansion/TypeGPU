import tgpu from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const root = await tgpu.init();
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
const device = root.device;

const spanUniform = root.createUniform(d.vec2f);

const fragment = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})(({ uv }) => {
  const red = std.floor(uv.x * spanUniform.$.x) / spanUniform.$.x;
  const green = std.floor(uv.y * spanUniform.$.y) / spanUniform.$.y;
  return d.vec4f(red, green, 0.5, 1.0);
});

const pipeline = root['~unstable']
  .withVertex(fullScreenTriangle)
  .withFragment(fragment, { format: presentationFormat })
  .createPipeline();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

function draw(spanXValue: number, spanYValue: number) {
  spanUniform.write(d.vec2f(spanXValue, spanYValue));

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);
}

let spanX = 10;
let spanY = 10;

draw(spanX, spanY);

// #region Example controls and cleanup

export const controls = {
  'x span ↔️': {
    initial: spanY,
    min: 0,
    max: 20,
    step: 1,
    onSliderChange: (newValue: number) => {
      spanX = newValue;
      draw(spanX, spanY);
    },
  },

  'y span ↕️': {
    initial: spanY,
    min: 0,
    max: 20,
    step: 1,
    onSliderChange: (newValue: number) => {
      spanY = newValue;
      draw(spanX, spanY);
    },
  },
};

export function onCleanup() {
  root.destroy();
}

// #endregion
