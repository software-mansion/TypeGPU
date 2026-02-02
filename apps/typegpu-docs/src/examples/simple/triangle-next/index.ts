import tgpu from 'typegpu';
import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

const purple = d.vec4f(0.769, 0.392, 1.0, 1);
const blue = d.vec4f(0.114, 0.447, 0.941, 1);

const getGradientColor = (ratio: number) => {
  'use gpu';
  return std.mix(purple, blue, ratio);
};

const root = await tgpu.init();
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const pos = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(0.0, 0.5),
  d.vec2f(-0.5, -0.5),
  d.vec2f(0.5, -0.5),
]);

const uv = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(0.5, 1.0),
  d.vec2f(0.0, 0.0),
  d.vec2f(1.0, 0.0),
]);

const pipeline = root['~unstable'].createRenderPipeline({
  vertex: ({ $vertexIndex }) => {
    'use gpu';
    return {
      $position: d.vec4f(pos.$[$vertexIndex], 0, 1),
      uv: uv.$[$vertexIndex],
    };
  },
  fragment: ({ uv }) => {
    'use gpu';
    return getGradientColor((uv.x + uv.y) / 2);
  },
  targets: { format: presentationFormat },
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;

context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

pipeline
  .withColorAttachment({
    view: context.getCurrentTexture().createView(),
    loadOp: 'clear',
    storeOp: 'store',
  })
  .draw(3);

export function onCleanup() {
  root.destroy();
}
