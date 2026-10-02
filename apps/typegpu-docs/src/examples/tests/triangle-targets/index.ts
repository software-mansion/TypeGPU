import { tgpu, d, std } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const format = navigator.gpu.getPreferredCanvasFormat();
const context = root.configureContext({
  canvas,
  alphaMode: 'premultiplied',
  format,
});

const secondTexture = root
  .createTexture({
    format: 'bgra8unorm',
    size: [canvas.clientWidth * devicePixelRatio, canvas.clientHeight * devicePixelRatio, 1],
  })
  .$usage('render', 'sampled');
const secondTextureView = secondTexture.createView(d.texture2d());
const sampler = root.createSampler({});

// A pipeline with two targets.
const pipeline = root.createRenderPipeline({
  vertex: ({ $vertexIndex: vid }) => {
    'use gpu';
    const pos = [d.vec2f(0.0, 0.5), d.vec2f(-0.5, -0.5), d.vec2f(0.5, -0.5)];

    return {
      $position: d.vec4f(pos[vid], 0, 1),
    };
  },
  fragment: tgpu.fragmentFn({
    out: { canvas: d.location(2, d.vec4f), workTexture: d.location(0, d.vec4f) },
  })(() => {
    'use gpu';
    return { canvas: d.vec4f(1, 0, 0, 1), workTexture: d.vec4f(0, 0, 1, 1) };
  }),
  targets: {
    workTexture: { format: 'bgra8unorm' },
  },
});

// A pipeline that blits the texture on the canvas rotated 180 degrees.
const blitPipeline = root.createRenderPipeline({
  vertex: fullScreenTriangle,
  fragment: ({ uv }) => {
    'use gpu';
    const value = std.textureSample(secondTextureView.$, sampler.$, 1 - uv);
    if (std.any(std.gt(value, d.vec4f(0)))) {
      return value;
    }
    std.discard();
    return d.vec4f();
  },
  targets: {
    blend: {
      color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
      alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    },
  },
});

// Run both pipelines

pipeline
  .withColorAttachment({
    workTexture: { view: secondTexture.createView('render') },
    canvas: { view: context },
  })
  .draw(3);

blitPipeline.withColorAttachment({ view: context, loadOp: 'load' }).draw(3);

// #region Cleanup

export function onCleanup() {
  root.destroy();
}

// #endregion
