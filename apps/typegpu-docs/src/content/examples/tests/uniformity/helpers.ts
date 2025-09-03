import type { TgpuRoot } from 'typegpu';
import { randomGeneratorSlot } from '@typegpu/noise';
import { fullScreenTriangleVertexShader } from './vertex.ts';
import { fullScreenGridFragmentShader } from './fragment.ts';

import { getPRNG, type PRNG } from './prngs.ts';

export const executePipeline = (
  root: TgpuRoot,
  context: GPUCanvasContext,
  prng: PRNG,
) => {
  const pipeline = root['~unstable']
    .with(randomGeneratorSlot, getPRNG(prng))
    .withVertex(fullScreenTriangleVertexShader, {})
    .withFragment(fullScreenGridFragmentShader, {
      format: context.getConfiguration()?.format as GPUTextureFormat,
    })
    .createPipeline();

  pipeline
    .withColorAttachment({
      view: context.getCurrentTexture().createView(),
      loadOp: 'clear',
      storeOp: 'store',
    })
    .draw(3);
};
