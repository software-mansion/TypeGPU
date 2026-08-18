import { describe, expect, it } from 'vitest';
import { tgpu } from 'typegpu';
import {
  finalizeRangeKernel,
  histogramRangeKernel,
  reduceRangeKernel,
  resetRangeKernel,
} from '../../src/examples/image-processing/monocular-light-injection/inference/disparity-range.ts';

describe('signed disparity percentile range WGSL', () => {
  it('maps signed finite floats into monotonic unsigned keys for atomic reduction', () => {
    const wgsl = tgpu.resolve([
      resetRangeKernel,
      reduceRangeKernel,
      histogramRangeKernel,
      finalizeRangeKernel,
    ]);
    expect(wgsl).toContain('2139095040u');
    expect(wgsl).toContain('2147483647u');
    expect(wgsl).toContain('2147483648u');
    expect(wgsl).toContain('4294967295u');
    expect(wgsl).toContain('atomicMin');
    expect(wgsl).toContain('atomicMax');
  });
});
