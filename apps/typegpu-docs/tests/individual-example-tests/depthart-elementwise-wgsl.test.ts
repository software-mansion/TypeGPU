import { describe, expect, it } from 'vitest';
import { tgpu } from 'typegpu';
import {
  addCombine,
  BinaryBroadcastCode,
  createBinaryKernel,
  createUnaryKernel,
  geluExact,
  negated,
  relu,
  type ElementwiseShape,
} from '../../src/examples/image-processing/monocular-light-injection/inference/kernels/index.ts';

/** Every binary dispatch in the model looks like this: no broadcast, exact channels. */
const RESIDUAL: ElementwiseShape = {
  elementCount: 75264,
  channelBlocks: 96,
  logicalChannels: 384,
};

describe('specialized elementwise WGSL', () => {
  it('reduces a residual add to two loads, an add, and a store', () => {
    const wgsl = tgpu.resolve([createBinaryKernel(RESIDUAL, addCombine, BinaryBroadcastCode.None)]);
    expect(wgsl).not.toMatch(/[\w)\]]\s*%\s*[\w(]/);
    expect(wgsl).not.toContain('select(');
    expect(wgsl).not.toMatch(/\.elementCount/);
    expect(wgsl).not.toMatch(/\.channelBlocks/);
    expect(wgsl).not.toMatch(/\.rhsBroadcast/);
    expect(wgsl).not.toContain('< 75264u');
  });

  it('keeps the bounds test only when the element count does not fill the workgroup', () => {
    const ragged = tgpu.resolve([
      createBinaryKernel(
        { ...RESIDUAL, elementCount: 75265 },
        addCombine,
        BinaryBroadcastCode.None,
      ),
    ]);
    expect(ragged).toContain('75265u');
  });

  it('folds the broadcast selection away when a dispatch actually broadcasts', () => {
    const wgsl = tgpu.resolve([
      createBinaryKernel(RESIDUAL, addCombine, BinaryBroadcastCode.Channels),
    ]);
    expect(wgsl).toMatch(/%\s*96u/);
    expect(wgsl).not.toMatch(/\.rhsBroadcast/);
  });

  it('prunes masking and bounds from a unary activation', () => {
    const wgsl = tgpu.resolve([createUnaryKernel(RESIDUAL, geluExact)]);
    expect(wgsl).not.toMatch(/[\w)\]]\s*%\s*[\w(]/);
    expect(wgsl).not.toContain('select(');
    expect(wgsl).not.toMatch(/\.channelBlocks/);
  });

  it('can negate a fused activation without adding a separate output pass', () => {
    const wgsl = tgpu.resolve([createUnaryKernel(RESIDUAL, negated(relu))]);
    expect(wgsl).toContain('return -(relu(value));');
  });
});
