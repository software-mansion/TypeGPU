import { describe, expect } from 'vitest';
import { tgpu, d, MissingOverridesError } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('tgpu.override', () => {
  describe('resolution', () => {
    it('resolves to an override declaration', () => {
      const scale = tgpu['~unstable'].override(d.f32);
      const fn1 = tgpu.fn([], d.f32)(() => scale.$);

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "override scale: f32;

        fn fn1() -> f32 {
          return scale;
        }"
      `);
    });

    it('emits the default value as an initializer', () => {
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const count = tgpu['~unstable'].override(d.u32, 4);
      const enabled = tgpu['~unstable'].override(d.bool, true);
      const fn1 = tgpu.fn(
        [],
        d.f32,
      )(() => {
        'use gpu';
        if (enabled.$) {
          return scale.$ * d.f32(count.$);
        }
        return 0;
      });

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "override count: u32 = 4u;

        override scale: f32 = 0.5f;

        override enabled: bool = true;

        fn fn1() -> f32 {
          if (enabled) {
            return (scale * f32(count));
          }
          return 0f;
        }"
      `);
    });

    it('does not fold overrides at comptime', () => {
      const enabled = tgpu['~unstable'].override(d.bool, false);
      const fn1 = tgpu.fn(
        [],
        d.f32,
      )(() => {
        'use gpu';
        const value = enabled.$;
        if (value) {
          return 1;
        }
        return 0;
      });

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "override enabled: bool = false;

        fn fn1() -> f32 {
          let value = enabled;
          if (value) {
            return 1f;
          }
          return 0f;
        }"
      `);
    });

    it('throws when mutating an override in a shader', () => {
      const scale = tgpu['~unstable'].override(d.f32, 1);
      const fn1 = tgpu.fn([])(() => {
        'use gpu';
        // @ts-expect-error: overrides are read-only
        scale.$ = 2;
      });

      expect(() => tgpu.resolve([fn1])).toThrowErrorMatchingInlineSnapshot(`
        [Error: Resolution of the following tree failed:
        - <root>
        - fn:fn1: 'scale.$ = 2' is invalid, because the left side is a constant.]
      `);
    });

    it('resolves an accessor fulfilled by an override', () => {
      const scale = tgpu.accessor(d.f32);
      const scaleOverride = tgpu['~unstable'].override(d.f32, 2);
      const fn1 = tgpu
        .fn(
          [],
          d.f32,
        )(() => scale.$)
        .with(scale, scaleOverride);

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "override scaleOverride: f32 = 2f;

        fn fn1() -> f32 {
          return scaleOverride;
        }"
      `);
    });
  });

  describe('schema & value validation', () => {
    it('rejects non-scalar schemas', () => {
      expect(() =>
        // @ts-expect-error: overrides can only be scalars
        tgpu['~unstable'].override(d.vec3f),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Invalid schema 'vec3f' for override: overrides can only hold scalars (bool, f32, f16, i32 or u32)]`,
      );
    });

    it('rejects invalid default values', () => {
      expect(() => tgpu['~unstable'].override(d.u32, -1)).toThrow(/expected an integer in range/);
      expect(() => tgpu['~unstable'].override(d.i32, 1.5)).toThrow(/expected an integer in range/);
    });

    it('rejects invalid pipeline values', ({ root }) => {
      const count = tgpu['~unstable'].override(d.u32, 1).$name('count');
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        count.$;
      });
      const pipeline = root.createComputePipeline({ compute: entry });

      expect(() => pipeline.with(count, 1.5)).toThrowErrorMatchingInlineSnapshot(
        `[Error: Value 1.5 is not a valid 'u32' for override 'count', expected an integer in range [0, 4294967295]]`,
      );
    });
  });

  describe('normal-mode access', () => {
    it('returns the default value', () => {
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      expect(scale.$).toBe(0.5);
    });

    it('throws when there is no default value', () => {
      const scale = tgpu['~unstable'].override(d.f32).$name('scale');
      expect(() => scale.$).toThrowErrorMatchingInlineSnapshot(
        `[Error: Override 'scale' has no default value, so it is inaccessible during normal JS execution]`,
      );
    });
  });

  describe('compute pipelines', () => {
    it('omits constants when no values are provided', ({ root, device }) => {
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      root.createComputePipeline({ compute: entry }).dispatchWorkgroups(1);

      expect(root.device.createComputePipeline).toHaveBeenCalledTimes(1);
      expect(device.mock.createComputePipeline.mock.calls[0]?.[0].compute).toEqual({
        module: 'mockShaderModule',
      });
    });

    it('passes provided values as pipeline constants', ({ root, device }) => {
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const enabled = tgpu['~unstable'].override(d.bool);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
        enabled.$;
      });

      root
        .createComputePipeline({ compute: entry })
        .with(scale, 2)
        .with(enabled, true)
        .dispatchWorkgroups(1);

      expect(device.mock.createComputePipeline.mock.calls[0]?.[0].compute).toEqual({
        module: 'mockShaderModule',
        constants: { scale: 2, enabled: 1 },
      });
    });

    it('uses the resolved identifiers as constant keys', ({ root, device }) => {
      const first = tgpu['~unstable'].override(d.f32).$name('value');
      const second = tgpu['~unstable'].override(d.f32).$name('value');
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        first.$;
        second.$;
      });

      root
        .createComputePipeline({ compute: entry })
        .with(first, 1)
        .with(second, 2)
        .dispatchWorkgroups(1);

      expect(device.mock.createComputePipeline.mock.calls[0]?.[0].compute).toEqual({
        module: 'mockShaderModule',
        constants: { value: 1, value_1: 2 },
      });
    });

    it('ignores values for overrides the shader does not use', ({ root, device }) => {
      const used = tgpu['~unstable'].override(d.f32);
      const unused = tgpu['~unstable'].override(d.f32);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        used.$;
      });

      root
        .createComputePipeline({ compute: entry })
        .with(used, 1)
        .with(unused, 2)
        .dispatchWorkgroups(1);

      expect(device.mock.createComputePipeline.mock.calls[0]?.[0].compute).toEqual({
        module: 'mockShaderModule',
        constants: { used: 1 },
      });
    });

    it('shares the shader module between specializations, and caches pipelines', ({
      root,
      device,
    }) => {
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      const pipeline = root.createComputePipeline({ compute: entry });
      pipeline.dispatchWorkgroups(1);
      pipeline.with(scale, 1).dispatchWorkgroups(1);
      pipeline.with(scale, 2).dispatchWorkgroups(1);
      pipeline.with(scale, 1).dispatchWorkgroups(1);
      pipeline.dispatchWorkgroups(1);

      expect(root.device.createShaderModule).toHaveBeenCalledTimes(1);
      expect(root.device.createPipelineLayout).toHaveBeenCalledTimes(1);
      expect(
        device.mock.createComputePipeline.mock.calls.map(([desc]) => desc.compute.constants),
      ).toEqual([undefined, { scale: 1 }, { scale: 2 }]);
    });

    it('passes constants to createComputePipelineAsync', async ({ root, device }) => {
      const scale = tgpu['~unstable'].override(d.f32);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      const pipeline = root.createComputePipeline({ compute: entry }).with(scale, 3);
      await pipeline.initAsync();
      pipeline.dispatchWorkgroups(1);

      expect(root.device.createComputePipelineAsync).toHaveBeenCalledTimes(1);
      expect(root.device.createComputePipeline).not.toHaveBeenCalled();
      expect(device.mock.createComputePipelineAsync.mock.calls[0]?.[0].compute).toEqual({
        module: 'mockShaderModule',
        constants: { scale: 3 },
      });
    });

    it('throws when no value is available', ({ root }) => {
      const scale = tgpu['~unstable'].override(d.f32).$name('scale');
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      const pipeline = root.createComputePipeline({ compute: entry });
      expect(() => pipeline.dispatchWorkgroups(1)).toThrow(MissingOverridesError);
      expect(() => pipeline.dispatchWorkgroups(1)).toThrowErrorMatchingInlineSnapshot(
        `[Error: Missing values for overrides: 'scale'. Please provide them using pipeline.with(override, value), or give the overrides default values]`,
      );
    });

    it('works with overrides fulfilling accessors', ({ root, device }) => {
      const scale = tgpu.accessor(d.f32);
      const scaleOverride = tgpu['~unstable'].override(d.f32);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      root
        .with(scale, scaleOverride)
        .createComputePipeline({ compute: entry })
        .with(scaleOverride, 4)
        .dispatchWorkgroups(1);

      expect(device.mock.createComputePipeline.mock.calls[0]?.[0].compute).toEqual({
        module: 'mockShaderModule',
        constants: { scaleOverride: 4 },
      });
    });
  });

  describe('render pipelines', () => {
    it('passes constants to both stages', ({ root, device }) => {
      const tint = tgpu['~unstable'].override(d.f32, 1);
      const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
        return { pos: d.vec4f() };
      });
      const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f(tint.$));

      root
        .createRenderPipeline({ vertex, fragment, targets: { format: 'rgba8unorm' } })
        .withColorAttachment({ view: {} as GPUTextureView })
        .with(tint, 0.5)
        .draw(3);

      const [descriptor] = device.mock.createRenderPipeline.mock.calls[0] as unknown as [
        GPURenderPipelineDescriptor,
      ];
      expect(descriptor.vertex.constants).toEqual({ tint: 0.5 });
      expect(descriptor.fragment?.constants).toEqual({ tint: 0.5 });
    });

    it('omits constants when no values are provided', ({ root, device }) => {
      const tint = tgpu['~unstable'].override(d.f32, 1);
      const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
        return { pos: d.vec4f() };
      });
      const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f(tint.$));

      root
        .createRenderPipeline({ vertex, fragment, targets: { format: 'rgba8unorm' } })
        .withColorAttachment({ view: {} as GPUTextureView })
        .draw(3);

      const [descriptor] = device.mock.createRenderPipeline.mock.calls[0] as unknown as [
        GPURenderPipelineDescriptor,
      ];
      expect(descriptor.vertex).not.toHaveProperty('constants');
      expect(descriptor.fragment).not.toHaveProperty('constants');
    });
  });
});
