import { describe, expect, it } from 'vitest';
import { tgpu } from 'typegpu';
import {
  createConv3x3SpecializedKernel,
  createNativeF16Conv3x3SpecializedKernel,
  spatialColumnCount,
  spatialSpecializedWorkgroups,
  spatialTileFor,
  SPATIAL_DEEP_ILP_TILE,
  SPATIAL_DEEP_TILE,
  SPATIAL_WIDE_TILE,
  type SpatialShape,
} from '../../src/examples/image-processing/monocular-light-injection/inference/kernels/index.ts';

/** 384->512 at 28x28 stride 2, the deepest encoder downsampler. */
const DOWNSAMPLE: SpatialShape = {
  inputChannelBlocks: 96,
  outputChannelBlocks: 128,
  inputWidth: 28,
  inputHeight: 28,
  outputWidth: 14,
  outputHeight: 14,
  strideX: 2,
  strideY: 2,
  padX: 1,
  padY: 1,
  logicalOutputChannels: 512,
};

/** 64->32 at 224x224 stride 1, one of the two reconstruction convolutions. */
const RECONSTRUCT: SpatialShape = {
  inputChannelBlocks: 16,
  outputChannelBlocks: 8,
  inputWidth: 224,
  inputHeight: 224,
  outputWidth: 224,
  outputHeight: 224,
  strideX: 1,
  strideY: 1,
  padX: 1,
  padY: 1,
  logicalOutputChannels: 32,
};

describe('specialized spatial WGSL', () => {
  for (const [name, shape] of [
    ['downsample', DOWNSAMPLE],
    ['reconstruct', RECONSTRUCT],
  ] as const) {
    const tile = spatialTileFor(shape);
    if (!tile) {
      throw new Error(`no tile for ${name}`);
    }

    it(`emits no runtime division or modulo for ${name}`, () => {
      const wgsl = tgpu.resolve([createConv3x3SpecializedKernel(shape, tile)]);
      expect(wgsl).not.toMatch(/[\w)\]]\s*\/\s*[\w(]/);
      expect(wgsl).not.toMatch(/[\w)\]]\s*%\s*[\w(]/);
    });

    it(`inlines every spatial constant for ${name}`, () => {
      const wgsl = tgpu.resolve([createConv3x3SpecializedKernel(shape, tile)]);
      expect(wgsl).not.toContain('params.inputWidth');
      expect(wgsl).not.toContain('params.inputHeight');
      expect(wgsl).not.toContain('params.outputWidth');
      expect(wgsl).not.toContain('params.strideX');
      expect(wgsl).not.toContain('params.padX');
      expect(wgsl).not.toContain('params.inputChannelBlocks');
      expect(wgsl).not.toContain('params.elementCount');
    });
  }

  it('picks the channel-heavy tile for downsamplers and the wide tile for reconstruction', () => {
    expect(spatialTileFor(DOWNSAMPLE)?.blockThreads).toBe(SPATIAL_DEEP_TILE.blockThreads);
    expect(spatialTileFor(RECONSTRUCT)).toBe(SPATIAL_WIDE_TILE);
  });

  it('sizes the staged column window from the tile and stride', () => {
    expect(spatialColumnCount(SPATIAL_DEEP_TILE, 2)).toBe(5);
    expect(spatialColumnCount(SPATIAL_WIDE_TILE, 1)).toBe(6);
  });

  it('launches one workgroup row per output row', () => {
    expect(spatialSpecializedWorkgroups(DOWNSAMPLE)).toEqual({ x: 8, y: 1, z: 14 });
    expect(spatialSpecializedWorkgroups(RECONSTRUCT)).toEqual({ x: 2, y: 4, z: 224 });
  });

  it('keeps deep-tile weight liveness inside the register budget', () => {
    // Weight vectors the compiler can hoist per K iteration across the unrolled
    // tap and column loops. Two blocks per thread measured as a spill on
    // launches large enough to schedule around it.
    for (const tile of [SPATIAL_DEEP_TILE, SPATIAL_WIDE_TILE]) {
      expect(tile.blocksPerThread * 3 * 4).toBeLessThanOrEqual(12);
    }
  });

  it('trades register headroom for ILP only on starved launches', () => {
    // 384->512 at 14x14 launches a few hundred groups either way and measured
    // faster with the second accumulator; the wider downsamplers did not.
    expect(spatialTileFor(DOWNSAMPLE)).toBe(SPATIAL_DEEP_ILP_TILE);
    expect(
      spatialTileFor({
        ...DOWNSAMPLE,
        outputChannelBlocks: 32,
        inputWidth: 112,
        inputHeight: 112,
        outputWidth: 56,
        outputHeight: 56,
      }),
    ).toBe(SPATIAL_DEEP_TILE);
  });

  it('routes reconstruction convolutions to the wide tile despite fitting the deep one', () => {
    expect(RECONSTRUCT.outputChannelBlocks).toBeGreaterThanOrEqual(
      SPATIAL_DEEP_TILE.blockThreads * SPATIAL_DEEP_TILE.blocksPerThread,
    );
    expect(spatialTileFor(RECONSTRUCT)).toBe(SPATIAL_WIDE_TILE);
  });

  it('resolves the native-FP16 variant with half columns', () => {
    const wgsl = tgpu.resolve([
      createNativeF16Conv3x3SpecializedKernel(
        {
          inputChannelBlocks: 8,
          outputChannelBlocks: 4,
          inputWidth: 448,
          inputHeight: 448,
          outputWidth: 448,
          outputHeight: 448,
          strideX: 1,
          strideY: 1,
          padX: 1,
          padY: 1,
          logicalOutputChannels: 16,
        },
        SPATIAL_WIDE_TILE,
      ),
    ]);
    expect(wgsl).toContain('vec4h');
    expect(wgsl).toContain('448');
    expect(wgsl).not.toContain('params.inputWidth');
    expect(wgsl).not.toMatch(/[\w)\]]\s*\/\s*[\w(]/);
  });
});
