import { describe, expect, it } from 'vitest';
import { tgpu } from 'typegpu';
import {
  createSpecializedLayerNormKernel,
  type LayerNormShape,
  layerNormLanesFor,
  layerNormWorkgroups,
} from '../../src/examples/image-processing/monocular-light-injection/inference/kernels/index.ts';

/** Every layer norm in DepthART-L normalizes the 14x14 stage. */
const shapeFor = (logicalChannels: number): LayerNormShape => ({
  pixelCount: 196,
  channelBlocks: logicalChannels / 4,
  logicalChannels,
});

const MODEL_CHANNELS = [16, 64, 192, 384];

describe('specialized layer norm', () => {
  it('splits one pixel across lanes instead of giving it to a single thread', () => {
    const launches = Object.fromEntries(
      MODEL_CHANNELS.map((channels) => {
        const shape = shapeFor(channels);
        const lanes = layerNormLanesFor(shape.channelBlocks);
        return [channels, { lanes, workgroups: layerNormWorkgroups(shape) }];
      }),
    );
    // The reference kernel launched one thread per pixel, so all four were
    // ceil(196 / 64) = 4 workgroups and 196 threads.
    expect(launches).toEqual({
      16: { lanes: 4, workgroups: 13 },
      64: { lanes: 16, workgroups: 49 },
      192: { lanes: 16, workgroups: 49 },
      384: { lanes: 32, workgroups: 98 },
    });
  });

  it('gives every lane the same block count, so the reduction needs no lane guard', () => {
    for (const channels of MODEL_CHANNELS) {
      const shape = shapeFor(channels);
      expect(shape.channelBlocks % layerNormLanesFor(shape.channelBlocks)).toBe(0);
    }
  });

  for (const channels of MODEL_CHANNELS) {
    const shape = shapeFor(channels);

    it(`divides only by the compile-time channel count for ${channels} channels`, () => {
      const wgsl = tgpu.resolve([createSpecializedLayerNormKernel(shape)]);
      expect(wgsl).not.toMatch(/[\w)\]]\s*%\s*[\w(]/);
      // An integer divide costs 10-20 instructions; a divide by a float literal
      // is one, so the mean and variance denominators are allowed to survive.
      const divisors = [...wgsl.matchAll(/[\w)\]]\s*\/\s*([^\s;),]+)/g)].map((match) => match[1]);
      expect([...new Set(divisors)]).toEqual([`${channels}f`]);
    });

    it(`reads no shape from the uniform for ${channels} channels`, () => {
      const wgsl = tgpu.resolve([createSpecializedLayerNormKernel(shape)]);
      expect(wgsl).not.toContain('params.channelBlocks');
      expect(wgsl).not.toContain('params.pixelCount');
      expect(wgsl).not.toContain('params.logicalChannels');
      expect(wgsl).toContain('params.epsilon');
    });

    it(`keeps every barrier in uniform control flow for ${channels} channels`, () => {
      const wgsl = tgpu.resolve([createSpecializedLayerNormKernel(shape)]);
      const guarded = wgsl.slice(wgsl.indexOf('if ((pixel < 196u))'));
      expect(guarded).not.toContain('workgroupBarrier');
      for (const line of wgsl.split('\n')) {
        if (line.includes('workgroupBarrier')) {
          expect(line.trimStart()).toBe('workgroupBarrier();');
        }
      }
    });
  }

  it('prunes channel masking when the block count is exact', () => {
    expect(tgpu.resolve([createSpecializedLayerNormKernel(shapeFor(384))])).not.toContain(
      'select(',
    );
  });
});
