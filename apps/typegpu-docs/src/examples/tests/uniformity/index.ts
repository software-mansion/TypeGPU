import tgpu, { type TgpuRenderPipeline } from 'typegpu';
import * as d from 'typegpu/data';

import * as c from './constants.ts';
import type { PRNG } from './prngs.ts';
import { executePipeline, preparePipeline } from './helpers.ts';

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
const pipelineCache = new Map<PRNG, TgpuRenderPipeline>();
let prng: PRNG = c.initialPRNG;

const redraw = (value: PRNG) => {
  let pipeline = undefined;
  if (!pipelineCache.has(value)) {
    pipeline = preparePipeline(
      root,
      presentationFormat,
      value,
      gridSizeUniform,
      canvasRatioUniform,
    );
    pipelineCache.set(value, pipeline);
  } else {
    pipeline = pipelineCache.get(value);
  }
  executePipeline(pipeline as TgpuRenderPipeline, context);
};

// #region Example controls & Cleanup
export const controls = {
  'PRNG': {
    initial: c.initialPRNG,
    options: c.prngs,
    onSelectChange: (value: PRNG) => {
      prng = value;
      redraw(value);
    },
  },
  'Grid Size': {
    initial: c.initialGridSize,
    options: c.gridSizes,
    onSelectChange: (value: number) => {
      gridSizeUniform.write(value);
      redraw(prng);
    },
  },
  'Test Resolution': import.meta.env.DEV && {
    onButtonClick: () => {
      c.prngs
        .map((prng) =>
          tgpu.resolve({
            externals: {
              f: preparePipeline(
                root,
                presentationFormat,
                prng,
                gridSizeUniform,
                canvasRatioUniform,
              ),
            },
          })
        )
        .map((r) => root.device.createShaderModule({ code: r }));
    },
  },
};

const resizeObserver = new ResizeObserver(() => {
  canvasRatioUniform.write(canvas.width / canvas.height);
  redraw(prng);
});
resizeObserver.observe(canvas);

export function onCleanup() {
  resizeObserver.disconnect();
  root.destroy();
}

// #endregion
