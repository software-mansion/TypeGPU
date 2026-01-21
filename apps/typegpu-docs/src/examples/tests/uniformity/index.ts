import { randf, randomGeneratorSlot } from '@typegpu/noise';
import tgpu, { common, d, std, type TgpuRenderPipeline } from 'typegpu';

import * as c from './constants.ts';
import { getPRNG, type PRNG } from './prngs.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = canvas.getContext('webgpu') as GPUCanvasContext;
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: root.device,
  format: presentationFormat,
  alphaMode: 'premultiplied',
});

const gridSizeUniform = root.createUniform(d.f32, c.initialGridSize);
const canvasRatioUniform = root.createUniform(
  d.f32,
  canvas.width / canvas.height,
);

const fragmentShader = tgpu['~unstable'].fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = input.uv.add(1).div(2).mul(d.vec2f(canvasRatioUniform.$, 1));
  const gridedUV = std.floor(uv.mul(gridSizeUniform.$));

  randf.seed2(gridedUV);

  return d.vec4f(d.vec3f(randf.sample()), 1.0);
});

const pipelineCache = new Map<PRNG, TgpuRenderPipeline>();
let prng: PRNG = c.initialPRNG;

const redraw = () => {
  let pipeline = pipelineCache.get(prng);
  if (!pipeline) {
    pipeline = root['~unstable']
      .with(randomGeneratorSlot, getPRNG(prng))
      .withVertex(common.fullScreenTriangle)
      .withFragment(
        fragmentShader,
        { format: presentationFormat },
      )
      .createPipeline();
    pipelineCache.set(prng, pipeline);
  }

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);
};

// #region Example controls & Cleanup
export const controls = {
  'PRNG': {
    initial: c.initialPRNG,
    options: c.prngs,
    onSelectChange: (value: PRNG) => {
      prng = value;
      redraw();
    },
  },
  'Grid Size': {
    initial: c.initialGridSize,
    options: c.gridSizes,
    onSelectChange: (value: number) => {
      gridSizeUniform.write(value);
      redraw();
    },
  },
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick: () => {
      const namespace = tgpu['~unstable'].namespace();
      c.prngs
        .map((prng) =>
          tgpu.resolve([
            root['~unstable']
              .with(randomGeneratorSlot, getPRNG(prng))
              .withVertex(common.fullScreenTriangle)
              .withFragment(
                fragmentShader,
                { format: presentationFormat },
              )
              .createPipeline(),
          ], { names: namespace })
        )
        .map((r) => root.device.createShaderModule({ code: r }));
    },
  },
};

const resizeObserver = new ResizeObserver(() => {
  canvasRatioUniform.write(canvas.width / canvas.height);
  redraw();
});
resizeObserver.observe(canvas);

export function onCleanup() {
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
