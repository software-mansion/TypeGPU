import { randomGeneratorSlot } from '@typegpu/noise';
import type { TgpuRenderPipeline, TgpuRoot, TgpuUniform } from 'typegpu';
import { fullScreenTriangle } from 'typegpu/common';
import type * as d from 'typegpu/data';

import { bindFullScreenGridFSWithUniforms } from './fragment.ts';
import { getPRNG, type PRNG } from './prngs.ts';

export const preparePipeline = (
  root: TgpuRoot,
  presentationFormat: GPUTextureFormat,
  prng: PRNG,
  gridSizeUniform: TgpuUniform<d.F32>,
  canvasRatioUniform: TgpuUniform<d.F32>,
): TgpuRenderPipeline =>
  root['~unstable']
    .with(randomGeneratorSlot, getPRNG(prng))
    .withVertex(fullScreenTriangle, {})
    .withFragment(
      bindFullScreenGridFSWithUniforms(gridSizeUniform, canvasRatioUniform),
      {
        format: presentationFormat,
      },
    )
    .createPipeline();

export const executePipeline = (
  pipeline: TgpuRenderPipeline,
  context: GPUCanvasContext,
) =>
  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);
