import tgpu, { d, std } from 'typegpu';

// Constants and helper functions

const purple = d.vec4f(0.769, 0.392, 1, 1);
const blue = d.vec4f(0.114, 0.447, 0.941, 1);

const getGradientColor = (ratio: number) => {
  'use gpu';
  return std.mix(purple, blue, ratio);
};

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

// Render pipeline

const root = await tgpu.init();
const pipeline = root.createRenderPipeline({
  vertex: ({ $vertexIndex: vid }) => {
    'use gpu';
    return {
      $position: d.vec4f(pos.$[vid], 0, 1),
      uv: uv.$[vid],
    };
  },
  fragment: ({ uv }) => {
    'use gpu';
    return getGradientColor((uv.x + uv.y) / 2);
  },
});

// Setting up the canvas and drawing to it

const context = root.configureContext({
  canvas: document.querySelector('canvas') as HTMLCanvasElement,
  alphaMode: 'premultiplied',
});

pipeline
  .withColorAttachment({ view: context })
  .draw(3);

// #region Cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
