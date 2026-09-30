import { tgpu, d, std } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';

const pos = tgpu.const(d.arrayOf(d.vec2f, 3), [
  d.vec2f(0.0, 0.5),
  d.vec2f(-0.5, -0.5),
  d.vec2f(0.5, -0.5),
]);

const root = await tgpu.init();
const secondTexture = root
  .createTexture({ format: 'bgra8unorm', size: [100, 100, 1] })
  .$usage('render', 'sampled');
const secondTextureView = secondTexture.createView(d.texture2d());
const sampler = root.createSampler({});

// A pipeline with two targets.
const pipeline = root.createRenderPipeline({
  vertex: ({ $vertexIndex: vid }) => {
    'use gpu';
    return {
      $position: d.vec4f(pos.$[vid], 0, 1),
    };
  },
  fragment: tgpu.fragmentFn({
    out: { canvas: d.location(1, d.vec4f), workTexture: d.location(0, d.vec4f) },
  })(() => {
    'use gpu';
    return { canvas: d.vec4f(1, 0, 0, 1), workTexture: d.vec4f(0, 0, 1, 1) };
  }),
});

// A pipeline that blits the texture on the canvas rotated 180 degrees.
const blitPipeline = root.createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const value = std.textureSample(secondTextureView.$, sampler.$, 1 - uv);
    return value;
  },
});

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const format = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({
  canvas,
  alphaMode: 'premultiplied',
  format,
});

pipeline
  .withColorAttachment({
    canvas: { view: context },
    workTexture: { view: secondTexture.createView('render') },
  })
  .draw(3);

blitPipeline.withColorAttachment({ view: context }).draw(3);

// #region Cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
