import type { TgpuRenderPipeline, TgpuRoot, TgpuUniform } from 'typegpu';
import { randomGeneratorSlot } from '@typegpu/noise';
import type * as d from 'typegpu/data';

import { fullScreenTriangleVertexShader } from './vertex.ts';
import { bindFullScreenGridFSWithUniforms } from './fragment.ts';
import { getPRNG, type PRNG } from './prngs.ts';

export const preparePipeline = (
  root: TgpuRoot,
  presentationFormat: GPUTextureFormat,
  prng: PRNG,
  gridSizeUniform: TgpuUniform<d.F32>,
  canvasRatioUniform: TgpuUniform<d.F32>,
): TgpuRenderPipeline => {
  return root['~unstable']
    .with(randomGeneratorSlot, getPRNG(prng))
    .withVertex(fullScreenTriangleVertexShader, {})
    .withFragment(
      bindFullScreenGridFSWithUniforms(gridSizeUniform, canvasRatioUniform),
      {
        format: presentationFormat,
      },
    )
    .createPipeline();
};

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
