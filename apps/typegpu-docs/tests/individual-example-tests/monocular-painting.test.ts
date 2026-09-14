import { describe, expect } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { common } from 'typegpu';
import {
  prepareStrokes,
  revealAt,
  incrementalAlpha,
  copyFrameFragment,
  downsampleFragment,
  paintFragment,
} from '../../src/examples/image-processing/monocular-painting/shaders.ts';

describe('monocular painting shaders', () => {
  it('reveals in stroke direction without multiplying opacity across frames', () => {
    expect(revealAt(-0.5, 0.2)).toBeGreaterThan(revealAt(0.5, 0.2));
    expect(revealAt(0.5, 0.5)).toBe(1);
    for (const position of [-1, -0.5, 0, 0.5, 1]) {
      expect(revealAt(position, -0.1)).toBe(0);
      expect(revealAt(position, 0)).toBe(0);
      expect(revealAt(position, 1)).toBe(1);
      for (const steps of [8, 24, 60]) {
        let color = 1;
        for (let step = 1; step <= steps; step++) {
          const alpha = incrementalAlpha(
            0.45,
            revealAt(position, (step - 1) / steps),
            revealAt(position, step / steps),
          );
          color = color * (1 - alpha) + 0.3 * alpha;
        }
        expect(color).toBeCloseTo(1 * 0.55 + 0.3 * 0.45, 5);
      }
    }
  });
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
