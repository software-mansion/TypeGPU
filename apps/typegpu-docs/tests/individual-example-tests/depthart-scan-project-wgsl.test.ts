import { describe, expect, it } from 'vitest';
import { tgpu } from 'typegpu';
import {
  createSpecializedScanProjectKernel,
  type ScanProjectShape,
  scanProjectThreadsFor,
} from '../../src/examples/image-processing/monocular-light-injection/inference/kernels/index.ts';

/** All five scan projections run at 14x14 across four traversal directions. */
const SHAPES: Record<string, ScanProjectShape> = {
  '16ch rank 4': {
    width: 14,
    height: 14,
    logicalChannels: 16,
    channelBlocks: 4,
    rank: 4,
    positionCount: 196,
  },
  '64ch rank 8': {
    width: 14,
    height: 14,
    logicalChannels: 64,
    channelBlocks: 16,
    rank: 8,
    positionCount: 196,
  },
  '192ch rank 24': {
    width: 14,
    height: 14,
    logicalChannels: 192,
    channelBlocks: 48,
    rank: 24,
    positionCount: 196,
  },
  '384ch rank 32': {
    width: 14,
    height: 14,
    logicalChannels: 384,
    channelBlocks: 96,
    rank: 32,
    positionCount: 196,
  },
};

describe('specialized scan projection', () => {
  it('sizes the launch to the work instead of a flat 128 lanes', () => {
    const threads = Object.fromEntries(
      Object.entries(SHAPES).map(([name, shape]) => [name, scanProjectThreadsFor(shape)]),
    );
    // The reference kernel launched 128 for every shape, which is where the
    // 65.5% and 70.3% ALU inefficiency at 16 and 64 channels came from.
    expect(threads).toEqual({
      '16ch rank 4': 32,
      '64ch rank 8': 32,
      '192ch rank 24': 64,
      '384ch rank 32': 96,
    });
    for (const count of Object.values(threads)) {
      expect(count % 32).toBe(0);
    }
  });

  for (const [name, shape] of Object.entries(SHAPES)) {
    const wgsl = () => tgpu.resolve([createSpecializedScanProjectKernel(shape)]);

    it(`divides and takes a remainder only by literals for ${name}`, () => {
      // A dynamic divisor is 10-20 instructions; by a literal the compiler
      // strength-reduces to a multiply and shift.
      const resolved = wgsl();
      const operands = [...resolved.matchAll(/[\w)\]]\s*[/%]\s*([^\s;),]+)/g)].map((m) => m[1]);
      expect(operands.length).toBeGreaterThan(0);
      for (const operand of operands) {
        expect(operand).toMatch(/^\d+[uif]?$/);
      }
    });

    it(`reads no shape from the uniform for ${name}`, () => {
      const resolved = wgsl();
      expect(resolved).not.toContain('params.channelBlocks');
      expect(resolved).not.toContain('params.logicalChannels');
      expect(resolved).not.toContain('params.rank');
      expect(resolved).not.toContain('params.positionCount');
      expect(resolved).not.toContain('params.directionPositionCount');
      expect(resolved).not.toContain('params.width');
      expect(resolved).not.toContain('params.height');
      // Weight offsets are bases, not shapes, and stay uniform reads.
      expect(resolved).toContain('xProjectionWeightBase');
      expect(resolved).toContain('dtProjectionWeightBase');
    });

    it(`prunes the channel guard for ${name}`, () => {
      // Every channel count fills its blocks exactly, so the guard on
      // `inputBlock * 4 + inputLane < logicalChannels` can never fire. The
      // `row < rank` comparison is not a guard; it routes rows to delta, B or C.
      expect(wgsl()).not.toContain(`< ${shape.logicalChannels}u`);
    });

    it(`recovers the direction from the dispatch rather than a division for ${name}`, () => {
      expect(wgsl()).toContain('wgid.y');
    });
  }
});
