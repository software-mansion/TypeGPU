import { describe, expect, it } from 'vitest';
import { tgpu } from 'typegpu';
import {
  createNativeF16SpecializedConv1x1Kernel,
  createSpecializedConv1x1Kernel,
  pointwiseSpecializedWorkgroups,
  pointwiseTileFor,
  type PointwiseShape,
} from '../../src/examples/image-processing/monocular-light-injection/inference/kernels/index.ts';

/** The 1536->384 projection at 28x28, which carries the largest share of model math. */
const MLP_DOWN: PointwiseShape = {
  inputChannelBlocks: 384,
  outputChannelBlocks: 96,
  pixelCount: 784,
  logicalOutputChannels: 384,
};

/** 64->256 at 112x112, whose pixel count divides the specialized tile exactly. */
const EXPANSION: PointwiseShape = {
  inputChannelBlocks: 16,
  outputChannelBlocks: 64,
  pixelCount: 12544,
  logicalOutputChannels: 256,
};

const builders = {
  portable: createSpecializedConv1x1Kernel,
  'native-f16': createNativeF16SpecializedConv1x1Kernel,
};

describe('specialized pointwise WGSL', () => {
  for (const [name, build] of Object.entries(builders)) {
    it(`emits no runtime division or modulo for the ${name} path`, () => {
      const wgsl = tgpu.resolve([build(MLP_DOWN)]);
      expect(wgsl).not.toMatch(/[\w)\]]\s*\/\s*[\w(]/);
      expect(wgsl).not.toMatch(/[\w)\]]\s*%\s*[\w(]/);
    });

    it(`inlines every shape constant for the ${name} path`, () => {
      const wgsl = tgpu.resolve([build(MLP_DOWN)]);
      expect(wgsl).toContain('384u');
      expect(wgsl).toContain('96u');
      expect(wgsl).not.toContain('params.inputChannelBlocks');
      expect(wgsl).not.toContain('params.outputChannelBlocks');
      expect(wgsl).not.toContain('params.outputWidth');
      expect(wgsl).not.toContain('params.elementCount');
    });

    it(`prunes the pixel guard when the tile divides the pixel count for ${name}`, () => {
      expect(tgpu.resolve([build(MLP_DOWN)])).toContain('< 784u');
      expect(tgpu.resolve([build(EXPANSION)])).not.toContain('< 12544u');
    });

    it(`prunes channel masking when the block count is exact for ${name}`, () => {
      expect(tgpu.resolve([build(MLP_DOWN)])).not.toContain('select(');
    });
  }

  it('covers every shape the model actually dispatches', () => {
    expect(pointwiseSpecializedWorkgroups(MLP_DOWN)).toEqual({ x: 12, y: 13 });
    expect(pointwiseSpecializedWorkgroups(EXPANSION)).toEqual({ x: 8, y: 196 });
  });

  it('declines shapes smaller than one specialized tile', () => {
    expect(
      pointwiseSpecializedWorkgroups({
        inputChannelBlocks: 4,
        outputChannelBlocks: 1,
        pixelCount: 200704,
        logicalOutputChannels: 1,
      }),
    ).toBeUndefined();
  });
});

describe('native-FP16 activation and weight storage width', () => {
  const wgsl = () => tgpu.resolve([createNativeF16SpecializedConv1x1Kernel(MLP_DOWN)]);

  it('addresses activations in 64-bit pairs rather than single words', () => {
    expect(wgsl()).toContain('src: array<vec2u>');
    expect(wgsl()).toContain('dst: array<vec2u>');
    expect(wgsl()).not.toContain('src: array<u32>');
  });

  it('reads a weight row with one typed load and no unpacking', () => {
    const resolved = wgsl();
    expect(resolved).toContain('weights: array<vec4h>');
    expect(resolved).toMatch(
      /fn nativeConvWeightAt\(\w+: u32\) -> vec4h \{[^}]*return weights\[[^\]]+\];\s*\}/,
    );
  });

  it('loads an FP32 activation vector in two halves', () => {
    expect(wgsl()).toMatch(/fn loadRawF32\([\s\S]*?src\[\(pairBase \+ 1u\)\][\s\S]*?\}/);
  });
});

describe('outer-product accumulation', () => {
  const wgsl = () => tgpu.resolve([createNativeF16SpecializedConv1x1Kernel(MLP_DOWN)]);

  it('scales whole weight vectors by input lanes instead of taking dot products', () => {
    const resolved = wgsl();
    expect(resolved).toMatch(/weight0 \* value\.x/);
    expect(resolved).toMatch(/weight1 \* value\.y/);
    expect(resolved).toMatch(/weight2 \* value\.z/);
    expect(resolved).toMatch(/weight3 \* value\.w/);
    expect(resolved).not.toContain('dot(');
  });

  it('carries a chunk in FP16 and flushes into FP32 accumulators', () => {
    const resolved = wgsl();
    expect(resolved).toContain('var accumulators = array<vec4f, 8>');
    expect(resolved).toContain('var chunkAccumulators = array<vec4h, 8>');
    expect(resolved).toMatch(/accumulators\[\w+\] \+ vec4f\(chunkAccumulators\[\w+\]\)/);
  });

  /**
   * Unrolling the chunk into the loop body hoists every load in it and spills,
   * which measured as a wash. The nested loop is the change.
   */
  it('keeps the flush as a real two-level loop', () => {
    const resolved = wgsl();
    expect(resolved).toMatch(/for \(var \w+ = 0u; \(\w+ < 384u\); \w+ \+= 8u\)/);
    expect(resolved).toMatch(/for \(var \w+ = 0u; \(\w+ < 8u\); \w+ \+= 1u\)/);
  });

  it('prunes the chunk guard when the flush divides the channel blocks', () => {
    expect(wgsl()).not.toContain('< 384u)) {');
    expect(
      tgpu.resolve([
        createNativeF16SpecializedConv1x1Kernel({
          inputChannelBlocks: 12,
          outputChannelBlocks: 96,
          pixelCount: 784,
          logicalOutputChannels: 384,
        }),
      ]),
    ).toContain('< 12u');
  });
});

describe('pointwise tile selection', () => {
  const shapes = {
    'mlp-down 1536->384 @28²': { i: 384, o: 96, px: 784, lc: 384 },
    'mlp-up 384->1536 @28²': { i: 96, o: 384, px: 784, lc: 1536 },
    'starved 2048->512 @14²': { i: 512, o: 128, px: 196, lc: 512 },
    'wide 512->2048 @14²': { i: 128, o: 512, px: 196, lc: 2048 },
    'expand 64->256 @112²': { i: 16, o: 64, px: 12544, lc: 256 },
  };

  it('keeps every shape on the four-pixel tile', () => {
    const picked = Object.fromEntries(
      Object.entries(shapes).map(([name, s]) => {
        const shape: PointwiseShape = {
          inputChannelBlocks: s.i,
          outputChannelBlocks: s.o,
          pixelCount: s.px,
          logicalOutputChannels: s.lc,
        };
        const wg = pointwiseSpecializedWorkgroups(shape);
        return [
          name,
          { pixels: pointwiseTileFor(shape)?.pixelsPerThread, groups: wg && wg.x * wg.y },
        ];
      }),
    );
    // Narrowing the 64-group shape to 208 groups measured 35% slower, so the
    // tile no longer varies with launch width. See POINTWISE_DEFAULT_TILE.
    expect(picked).toEqual({
      'mlp-down 1536->384 @28²': { pixels: 4, groups: 156 },
      'mlp-up 384->1536 @28²': { pixels: 4, groups: 624 },
      'starved 2048->512 @14²': { pixels: 4, groups: 64 },
      'wide 512->2048 @14²': { pixels: 4, groups: 256 },
      'expand 64->256 @112²': { pixels: 4, groups: 1568 },
    });
  });
});
