import { randf, randomGeneratorSlot } from '@typegpu/noise';
import tgpu, { common, d, std, type TgpuRenderPipeline } from 'typegpu';

import * as c from './constants.ts';
import { getPRNG, type PRNG } from './prngs.ts';
import { defineControls } from '../../common/defineControls.ts';

const root = await tgpu.init();

const canvas = document.querySelector('canvas') as HTMLCanvasElement;
const context = root.configureContext({ canvas, alphaMode: 'premultiplied' });
const presentationFormat = navigator.gpu.getPreferredCanvasFormat();

const gridSizeUniform = root.createUniform(d.f32, c.initialGridSize);
const canvasRatioUniform = root.createUniform(
  d.f32,
  canvas.width / canvas.height,
);

const fragmentShader = tgpu.fragmentFn({
  in: { uv: d.vec2f },
  out: d.vec4f,
})((input) => {
  const uv = input.uv.add(1).div(2).mul(d.vec2f(canvasRatioUniform.$, 1));
  const gridedUV = std.floor(uv.mul(gridSizeUniform.$));

  randf.seed2(gridedUV);

  return d.vec4f(d.vec3f(randf.sample()), 1.0);
});

const pipelineCache = new Map<PRNG, TgpuRenderPipeline<d.Vec4f>>();
let prng: PRNG = c.initialPRNG;

const redraw = () => {
  let pipeline = pipelineCache.get(prng);
  if (!pipeline) {
    pipeline = root
      .with(randomGeneratorSlot, getPRNG(prng))
      .createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: fragmentShader,
        targets: { format: presentationFormat },
      });
    pipelineCache.set(prng, pipeline);
  }

  pipeline
    .withColorAttachment({ view: context })
    .draw(3);
};

// #region Example controls & Cleanup
export const controls = defineControls({
  'PRNG': {
    initial: c.initialPRNG,
    options: c.prngs,
    onSelectChange: (value) => {
      prng = value;
      redraw();
    },
  },
  'Grid Size': {
    initial: c.initialGridSize,
    options: c.gridSizes,
    onSelectChange: (value) => {
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
            root
              .with(randomGeneratorSlot, getPRNG(prng))
              .createRenderPipeline({
                vertex: common.fullScreenTriangle,
                fragment: fragmentShader,
                targets: { format: presentationFormat },
              }),
          ], { names: namespace })
        )
        .map((r) => root.device.createShaderModule({ code: r }));
    },
  },
});

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
