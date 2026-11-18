import { describe, expect, vi } from 'vitest';
import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { $internal } from '../../src/shared/symbols.ts';

describe('pipeline variants', () => {
  describe('compute pipelines', () => {
    it('shares the core between chained variants', ({ root }) => {
      const a = tgpu['~unstable'].override(d.f32, 0);
      const b = tgpu['~unstable'].override(d.f32, 0);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        a.$;
        b.$;
      });

      const base = root.createComputePipeline({ compute: entry });
      const chained = base
        .createVariant({ overrides: [[a, 1]] })
        .createVariant({ overrides: [[b, 2]] });
      const overwritten = chained.createVariant({ overrides: [[a, 3]] });

      expect(chained[$internal].core).toBe(base[$internal].core);
      expect(overwritten[$internal].core).toBe(base[$internal].core);
    });

    it('shares priors with the source pipeline', ({ root }) => {
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      const base = root.createComputePipeline({ compute: entry }).withPerformanceCallback(vi.fn());
      const variant = base.createVariant({ overrides: [[scale, 2]] });

      expect(variant[$internal].priors).toBe(base[$internal].priors);
    });
  });

  describe('render pipelines', () => {
    it('shares the core and priors between chained variants', ({ root }) => {
      const tint = tgpu['~unstable'].override(d.f32, 1);
      const useFog = tgpu['~unstable'].override(d.bool, false);
      const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
        return { pos: d.vec4f() };
      });
      const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => {
        'use gpu';
        if (useFog.$) {
          return d.vec4f(0);
        }
        return d.vec4f(tint.$);
      });

      const base = root
        .createRenderPipeline({ vertex, fragment, targets: { format: 'rgba8unorm' } })
        .withColorAttachment({ view: {} as GPUTextureView });
      const foggy = base
        .createVariant({ overrides: [[tint, 0.25]] })
        .createVariant({ overrides: [[useFog, true]] });

      expect(foggy[$internal].core).toBe(base[$internal].core);
      expect(foggy[$internal].priors).toBe(base[$internal].priors);
    });
  });
});
