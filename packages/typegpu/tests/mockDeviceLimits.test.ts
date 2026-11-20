import { describe, expect } from 'vitest';
import { d, tgpu, type TgpuRoot } from 'typegpu';
import { it, type MockDevice } from 'typegpu-testing-utility';

/**
 * A compute pipeline whose entry function uses `count` separate bind group layouts,
 * so its pipeline layout has exactly `count` bind groups.
 */
function createPipelineWithBindGroups(root: TgpuRoot, count: number) {
  const layouts = Array.from({ length: count }, () =>
    tgpu.bindGroupLayout({ value: { uniform: d.f32 } }),
  );

  const main = tgpu.computeFn({ workgroupSize: [1] })(() => {
    'use gpu';
    let sum = d.f32(0);
    for (const layout of tgpu.unroll(layouts)) {
      sum += layout.$.value;
    }
  });

  return root.createComputePipeline({ compute: main });
}

/** Clears the violations a test provoked on purpose, so the `device` fixture doesn't fail it */
function acknowledgeViolations(device: MockDevice) {
  return device.mock.limitViolations.splice(0);
}

describe('mock device limits', () => {
  describe('maxBindGroups', () => {
    it('defaults to 4', ({ device }) => {
      expect(device.limits.maxBindGroups).toBe(4);
    });

    it('accepts a pipeline layout at the limit', ({ root, device }) => {
      const pipeline = createPipelineWithBindGroups(root, 4);

      expect(() => root.unwrap(pipeline)).not.toThrow();
      expect(device.mock.createPipelineLayout).toHaveBeenCalledOnce();
      expect(device.mock.createPipelineLayout.mock.calls[0]?.[0]?.bindGroupLayouts).toHaveLength(4);
      expect(device.mock.limitViolations).toHaveLength(0);
    });

    it('rejects a pipeline layout over the limit', ({ root, device }) => {
      const pipeline = createPipelineWithBindGroups(root, 5);

      expect(() => root.unwrap(pipeline)).toThrowErrorMatchingInlineSnapshot(
        `[Error: [mock GPUDevice] Pipeline layout '<unnamed> - Pipeline Layout' uses 5 bind groups, but limits.maxBindGroups is 4. A real device rejects this pipeline. Use fewer bind groups, or request a higher 'maxBindGroups' through 'requiredLimits'.]`,
      );
      expect(acknowledgeViolations(device)).toHaveLength(1);
    });

    it('counts null entries, like real WebGPU', ({ device }) => {
      expect(() =>
        device.createPipelineLayout({
          bindGroupLayouts: [null, null, null, null, 'mockBindGroupLayout' as never],
        }),
      ).toThrow(/uses 5 bind groups, but limits\.maxBindGroups is 4/);
      expect(acknowledgeViolations(device)).toHaveLength(1);
    });

    it('honors a raised limit requested through tgpu.init', async ({ device }) => {
      const root = await tgpu.init({ device: { requiredLimits: { maxBindGroups: 5 } } });

      try {
        expect(device.limits.maxBindGroups).toBe(5);
        expect(() => root.unwrap(createPipelineWithBindGroups(root, 5))).not.toThrow();
        expect(() => root.unwrap(createPipelineWithBindGroups(root, 6))).toThrow(
          /uses 6 bind groups, but limits\.maxBindGroups is 5/,
        );
        expect(acknowledgeViolations(device)).toHaveLength(1);
      } finally {
        root.destroy();
      }
    });

    it('keeps the default when a lower limit is requested', async ({ adapter, device }) => {
      await adapter.requestDevice({ requiredLimits: { maxBindGroups: 2 } });

      expect(device.limits.maxBindGroups).toBe(4);
    });

    it('rejects a requested limit the adapter does not support', async ({ adapter }) => {
      await expect(
        adapter.requestDevice({ requiredLimits: { maxBindGroups: 9 } }),
      ).rejects.toThrowErrorMatchingInlineSnapshot(
        `[Error: [mock GPUAdapter] Requested maxBindGroups (9) exceeds the adapter's limit (8).]`,
      );
    });
  });
});
