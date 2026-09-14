import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { common } from 'typegpu';
import {
  prepareStrokes,
  copyFrameFragment,
  downsampleFragment,
  paintFragment,
} from '../../src/examples/image-processing/monocular-painting/shaders.ts';

describe('monocular painting shaders', () => {
  it('resolves frame-copy and bilinear mip pipelines', async ({ root, device }) => {
    for (const fragment of [copyFrameFragment, downsampleFragment]) {
      await root
        .createRenderPipeline({
          vertex: common.fullScreenTriangle,
          fragment,
          targets: { format: 'rgba8unorm' },
        })
        .initAsync();
    }
    expect(device.mock.createShaderModule).toHaveBeenCalledTimes(2);
  });
  it('resolves stroke preparation and painting pipelines', async ({ root, device }) => {
    await root
      .createComputePipeline({ compute: prepareStrokes })
      .$name('prepare strokes')
      .initAsync();
    await root
      .createRenderPipeline({
        vertex: common.fullScreenTriangle,
        fragment: paintFragment,
        targets: { format: 'rgba8unorm' },
      })
      .$name('paint strokes')
      .initAsync();
    expect(device.mock.createShaderModule).toHaveBeenCalledTimes(2);
    expect(device.mock.createShaderModule).toHaveBeenCalledWith(
      expect.objectContaining({ code: expect.stringContaining('texture_external') }),
    );
  });
});
