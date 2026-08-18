import { describe, expect, it } from 'vitest';
import { tgpu } from 'typegpu';
import {
  createSpecializedWinogradGemmKernel,
  type WinogradGemmShape,
  winogradF4InputTransformKernel,
  winogradF4OutputTransformKernel,
  winogradGemmSpecializedWorkgroups,
  winogradGemmTileFor,
} from '../../src/examples/image-processing/monocular-light-injection/inference/kernels/index.ts';

/** Every Winograd convolution in DepthART-L outputs 64 channels. */
const SHAPES: Record<string, WinogradGemmShape> = {
  '64->64 @112': { tileCount: 784, inputChannelBlocks: 16, outputChannelBlocks: 16 },
  '128->64 @56': { tileCount: 196, inputChannelBlocks: 32, outputChannelBlocks: 16 },
  '384->64 @28': { tileCount: 49, inputChannelBlocks: 96, outputChannelBlocks: 16 },
  '512->64 @14': { tileCount: 16, inputChannelBlocks: 128, outputChannelBlocks: 16 },
};

const resolved = (shape: WinogradGemmShape, nativeF16: boolean) => {
  const tile = winogradGemmTileFor(shape);
  if (!tile) {
    throw new Error('shape has no specialized tile');
  }
  return tgpu.resolve([createSpecializedWinogradGemmKernel(shape, tile, nativeF16)]);
};

describe('specialized Winograd GEMM', () => {
  it('picks a register tile by shape and declines the smallest launch', () => {
    const picked = Object.fromEntries(
      Object.entries(SHAPES).map(([name, shape]) => {
        const tile = winogradGemmTileFor(shape);
        const workgroups = winogradGemmSpecializedWorkgroups(shape);
        return [
          name,
          tile
            ? {
                accumulators: tile.blocksPerThread * tile.tilesPerThread,
                workgroups: workgroups ? workgroups.x * workgroups.y * workgroups.z : undefined,
              }
            : 'staged fallback',
        ];
      }),
    );
    // Sixteen accumulators fell off a register cliff in the 1x1 sweep, so the
    // tile trades tiles-per-thread against blocks-per-thread to stay at eight.
    expect(picked).toEqual({
      '64->64 @112': { accumulators: 8, workgroups: 936 },
      '128->64 @56': { accumulators: 8, workgroups: 288 },
      '384->64 @28': { accumulators: 8, workgroups: 72 },
      '512->64 @14': 'staged fallback',
    });
  });

  for (const [name, shape] of Object.entries(SHAPES)) {
    if (!winogradGemmTileFor(shape)) {
      continue;
    }

    for (const nativeF16 of [false, true]) {
      const precision = nativeF16 ? 'native-f16' : 'f32';

      it(`emits no runtime division or modulo for ${name} ${precision}`, () => {
        const wgsl = resolved(shape, nativeF16);
        expect(wgsl).not.toMatch(/[\w)\]]\s*\/\s*[\w(]/);
        expect(wgsl).not.toMatch(/[\w)\]]\s*%\s*[\w(]/);
      });

      it(`drops the staged tiles and their barriers for ${name} ${precision}`, () => {
        const wgsl = resolved(shape, nativeF16);
        expect(wgsl).not.toContain('workgroupBarrier');
        expect(wgsl).not.toContain('var<workgroup>');
      });

      it(`reads no shape from the uniform for ${name} ${precision}`, () => {
        const wgsl = resolved(shape, nativeF16);
        expect(wgsl).not.toContain('params.tileCount');
        expect(wgsl).not.toContain('params.inputChannelBlocks');
        expect(wgsl).not.toContain('params.outputChannelBlocks');
        // The weight offset is a base, not a shape, and stays a uniform read.
        expect(wgsl).toContain('weightBasePairs');
      });

      it(`addresses transformed data in 64-bit pairs for ${name} ${precision}`, () => {
        const wgsl = resolved(shape, nativeF16);
        expect(wgsl).toContain('src: array<vec2u>');
        expect(wgsl).toContain('weights: array<vec2u>');
        expect(wgsl).not.toContain('array<u32>');
      });
    }

    it(`keeps half precision out of the FP32 path for ${name}`, () => {
      expect(resolved(shape, false)).not.toContain('vec4h');
      expect(resolved(shape, true)).toContain('vec4h');
    });

    it(`accumulates in FP32 for ${name} regardless of product precision`, () => {
      for (const nativeF16 of [false, true]) {
        expect(resolved(shape, nativeF16)).toContain('array<vec4f, 8>');
      }
    });
  }
});

describe('Winograd F4 transforms', () => {
  const transforms = {
    input: winogradF4InputTransformKernel,
    output: winogradF4OutputTransformKernel,
  };

  for (const [name, kernel] of Object.entries(transforms)) {
    const wgsl = () => tgpu.resolve([kernel]);

    it(`launches a whole number of SIMD groups for the ${name} transform`, () => {
      const size = wgsl().match(/@workgroup_size\((\d+)\)/)?.[1];
      // 4 pairs x 36 coefficients = 144 threads padded to 160 lanes, which
      // `kernel_invocations` measured as 111.1% of the launched thread count.
      expect(size).toBe('96');
      expect(Number(size) % 32).toBe(0);
    });

    it(`selects no transform row with a branch for the ${name} transform`, () => {
      const body = wgsl().match(/fn \w*TransformRow\([^)]*\)[^{]*\{([\s\S]*?)\n\}/)?.[1];
      expect(body).toBeDefined();
      expect(body).not.toContain('if ');
      expect(body).not.toContain('select(');
    });

    it(`needs one barrier for the ${name} transform`, () => {
      expect(wgsl().split('workgroupBarrier').length - 1).toBe(1);
    });

    it(`stays inside the default workgroup storage limit for the ${name} transform`, () => {
      const declared = [...wgsl().matchAll(/var<workgroup> \w+: array<vec4f, (\d+)>/g)];
      const bytes = declared.reduce((total, match) => total + Number(match[1]) * 16, 0);
      expect(bytes).toBeGreaterThan(0);
      expect(bytes).toBeLessThanOrEqual(16384);
    });
  }
});
