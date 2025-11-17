import { describe, expect, it } from 'vitest';
import {
  isGPUCommandEncoder,
  isGPUComputePassEncoder,
  isGPURenderBundleEncoder,
  isGPURenderPassEncoder,
} from '../../src/core/pipeline/typeGuards.ts';

// JSI HostObjects expose native methods through property lookup, but their `has` trap reports false
function jsiLike(methods: Record<string, () => void>): object {
  return new Proxy(
    {},
    {
      get: (_target, key) => methods[String(key)],
      has: () => false,
    },
  );
}

describe('pipeline WebGPU type guards', () => {
  it('recognizes a JSI-like command encoder without relying on `in`', () => {
    const encoder = jsiLike({ beginRenderPass() {}, beginComputePass() {} });

    expect(isGPUCommandEncoder(encoder)).toBe(true);
    expect(isGPUComputePassEncoder(encoder)).toBe(false);
  });

  it('recognizes JSI-like compute and render pass encoders', () => {
    const computePass = jsiLike({ dispatchWorkgroups() {} });
    const renderPass = jsiLike({ executeBundles() {}, draw() {} });

    expect(isGPUComputePassEncoder(computePass)).toBe(true);
    expect(isGPURenderPassEncoder(renderPass)).toBe(true);
  });

  it('keeps a JSI-like render bundle distinct from a render pass', () => {
    const bundle = jsiLike({ draw() {}, finish() {} });

    expect(isGPURenderBundleEncoder(bundle)).toBe(true);
    expect(isGPURenderPassEncoder(bundle)).toBe(false);
  });
});
