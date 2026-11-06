import { describe, expect, expectTypeOf, vi } from 'vitest';
import { tgpu, d, MissingOverridesError, type TgpuRoot } from 'typegpu';
import { restoreResource, snapshotResource } from 'typegpu/~internal';
import { it } from 'typegpu-testing-utility';

function roundTrip<T>(value: T, root: TgpuRoot): T {
  const snapshot = snapshotResource(value);
  if (!snapshot) {
    throw new Error('Expected the value to be snapshotable.');
  }
  return restoreResource(snapshot, { getRoot: () => root }) as T;
}

function createRenderSetup(root: TgpuRoot) {
  const tint = tgpu['~unstable'].override(d.f32, 1).$name('tint');
  const useFog = tgpu['~unstable'].override(d.bool, false).$name('useFog');
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
  const pipeline = root
    .createRenderPipeline({ vertex, fragment, targets: { format: 'rgba8unorm' } })
    .withColorAttachment({ view: {} as GPUTextureView });

  return { tint, useFog, vertex, fragment, pipeline };
}

function renderConstantsOf(call: unknown) {
  const [descriptor] = call as [GPURenderPipelineDescriptor];
  return {
    vertex: descriptor.vertex.constants,
    fragment: descriptor.fragment?.constants,
  };
}

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
        - fn:fn1: 'scale.$ = 2' is invalid, because the left side is immutable.]
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

      expect(() =>
        pipeline.createVariant({ overrides: [[count, 1.5]] }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Value 1.5 is not a valid 'u32' for override 'count', expected an integer in range [0, 4294967295]]`,
      );
      expect(() =>
        root.createComputePipeline({ compute: entry, overrides: [[count, -1]] }),
      ).toThrow(/expected an integer in range/);
    });

    it('types values against the override schema', ({ root }) => {
      const count = tgpu['~unstable'].override(d.u32, 1);
      const enabled = tgpu['~unstable'].override(d.bool, false);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        count.$;
        enabled.$;
      });
      const pipeline = root.createComputePipeline({ compute: entry });

      pipeline.createVariant({
        overrides: [
          [count, 2],
          [enabled, true],
        ],
      });
      expect(() =>
        // @ts-expect-error: bool overrides take booleans
        pipeline.createVariant({ overrides: [[enabled, 1]] }),
      ).toThrow(/Expected a boolean value/);
      expect(() =>
        // @ts-expect-error: u32 overrides take numbers
        pipeline.createVariant({ overrides: [[count, true]] }),
      ).toThrow(/Expected a finite number/);
    });

    it('removes the .with(override, value) overload', ({ root }) => {
      const count = tgpu['~unstable'].override(d.u32, 1);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        count.$;
      });
      const pipeline = root.createComputePipeline({ compute: entry });

      // @ts-expect-error: overrides are provided through createVariant
      expect(() => pipeline.with(count, 2)).toThrow(/Unsupported value passed into .with()/);
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

    it('passes values provided at creation as pipeline constants', ({ root, device }) => {
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const enabled = tgpu['~unstable'].override(d.bool);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
        enabled.$;
      });

      root
        .createComputePipeline({
          compute: entry,
          overrides: [
            [scale, 2],
            [enabled, true],
          ],
        })
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
        .createComputePipeline({
          compute: entry,
          overrides: [
            [first, 1],
            [second, 2],
          ],
        })
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
        .createComputePipeline({
          compute: entry,
          overrides: [
            [used, 1],
            [unused, 2],
          ],
        })
        .dispatchWorkgroups(1);

      expect(device.mock.createComputePipeline.mock.calls[0]?.[0].compute).toEqual({
        module: 'mockShaderModule',
        constants: { used: 1 },
      });
    });

    it('merges variant values on top of the source pipeline', ({ root, device }) => {
      const iterations = tgpu['~unstable'].override(d.u32).$name('iterations');
      const scale = tgpu['~unstable'].override(d.f32).$name('scale');
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        iterations.$;
        scale.$;
      });

      const base = root.createComputePipeline({
        compute: entry,
        overrides: [
          [iterations, 8],
          [scale, 1],
        ],
      });
      const fast = base.createVariant({ overrides: [[iterations, 2]] });

      base.dispatchWorkgroups(1);
      fast.dispatchWorkgroups(1);

      expect(
        device.mock.createComputePipeline.mock.calls.map(([desc]) => desc.compute.constants),
      ).toEqual([
        { iterations: 8, scale: 1 },
        { iterations: 2, scale: 1 },
      ]);
    });

    it('chains variants as peers sharing one shader module', ({ root, device }) => {
      const a = tgpu['~unstable'].override(d.f32, 0).$name('a');
      const b = tgpu['~unstable'].override(d.f32, 0).$name('b');
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        a.$;
        b.$;
      });

      const base = root.createComputePipeline({ compute: entry });
      const intermediate = base.createVariant({ overrides: [[a, 1]] });
      const chained = intermediate.createVariant({ overrides: [[b, 2]] });
      const overwritten = chained.createVariant({ overrides: [[a, 3]] });

      chained.dispatchWorkgroups(1);
      overwritten.dispatchWorkgroups(1);

      // The intermediate variant is never used, so it never compiles
      expect(root.device.createShaderModule).toHaveBeenCalledTimes(1);
      expect(root.device.createPipelineLayout).toHaveBeenCalledTimes(1);
      expect(
        device.mock.createComputePipeline.mock.calls.map(([desc]) => desc.compute.constants),
      ).toEqual([
        { a: 1, b: 2 },
        { a: 3, b: 2 },
      ]);
    });

    it('compiles exactly one pipeline per variant, without caching by value', ({
      root,
      device,
    }) => {
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      const pipeline = root.createComputePipeline({ compute: entry });
      const first = pipeline.createVariant({ overrides: [[scale, 1]] });
      const same = pipeline.createVariant({ overrides: [[scale, 1]] });

      for (let i = 0; i < 3; i++) {
        pipeline.dispatchWorkgroups(1);
        first.dispatchWorkgroups(1);
        same.dispatchWorkgroups(1);
      }

      // Every variant owns its pipeline, even when the values match
      expect(root.device.createShaderModule).toHaveBeenCalledTimes(1);
      expect(
        device.mock.createComputePipeline.mock.calls.map(([desc]) => desc.compute.constants),
      ).toEqual([undefined, { scale: 1 }, { scale: 1 }]);
    });

    it('shares the compiled pipeline between with* derivations of a variant', ({
      root,
      device,
    }) => {
      const layout = tgpu.bindGroupLayout({ values: { storage: d.arrayOf(d.u32, 4) } });
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        'use gpu';
        const v = layout.$.values[0];
        scale.$;
      });
      const buffer = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');
      const bindGroup = root.createBindGroup(layout, { values: buffer });

      const variant = root
        .createComputePipeline({ compute: entry })
        .createVariant({ overrides: [[scale, 2]] });

      variant.with(bindGroup).dispatchWorkgroups(1);
      variant.with(bindGroup).dispatchWorkgroups(1);

      expect(root.device.createComputePipeline).toHaveBeenCalledTimes(1);
      expect(device.mock.createComputePipeline.mock.calls[0]?.[0].compute.constants).toEqual({
        scale: 2,
      });
    });

    it('carries priors over to variants', ({ root, device }) => {
      const layout = tgpu.bindGroupLayout({ values: { storage: d.arrayOf(d.u32, 4) } });
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        'use gpu';
        const v = layout.$.values[0];
        scale.$;
      });
      const buffer = root.createBuffer(d.arrayOf(d.u32, 4)).$usage('storage');
      const bindGroup = root.createBindGroup(layout, { values: buffer });
      const callback = vi.fn();

      const base = root
        .createComputePipeline({ compute: entry })
        .with(bindGroup)
        .withPerformanceCallback(callback);
      const variant = base.createVariant({ overrides: [[scale, 2]] });

      // Would throw MissingBindGroupsError if the bind group was not carried over
      variant.dispatchWorkgroups(1);
      expect(device.mock.createComputePipeline).toHaveBeenCalledTimes(1);
    });

    it('compiles variants asynchronously', async ({ root, device }) => {
      const scale = tgpu['~unstable'].override(d.f32);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      const base = root.createComputePipeline({ compute: entry, overrides: [[scale, 1]] });
      const variant = base.createVariant({ overrides: [[scale, 3]] });

      const promise = variant.initAsync();
      expect(variant.initAsync()).toBe(promise);
      expect(() => variant.initSync()).toThrowErrorMatchingInlineSnapshot(
        `[Error: 'pipeline.initAsync()' was called and is not yet resolved.]`,
      );
      await promise;
      await variant.initAsync();
      variant.dispatchWorkgroups(1);

      expect(root.device.createShaderModule).toHaveBeenCalledTimes(1);
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
        `[Error: Missing values for overrides: 'scale'. Please provide them through the pipeline's 'overrides', or give the overrides default values]`,
      );
      expect(() => pipeline.initAsync()).toThrow(MissingOverridesError);

      const variant = pipeline.createVariant({ overrides: [[scale, 1]] });
      expect(() => variant.dispatchWorkgroups(1)).not.toThrow();
    });

    it('works with overrides fulfilling accessors', ({ root, device }) => {
      const scale = tgpu.accessor(d.f32);
      const scaleOverride = tgpu['~unstable'].override(d.f32);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      root
        .with(scale, scaleOverride)
        .createComputePipeline({ compute: entry, overrides: [[scaleOverride, 4]] })
        .dispatchWorkgroups(1);

      expect(device.mock.createComputePipeline.mock.calls[0]?.[0].compute).toEqual({
        module: 'mockShaderModule',
        constants: { scaleOverride: 4 },
      });
    });

    it('restores a variant as its own compiled pipeline', ({ root, device }) => {
      const scale = tgpu['~unstable'].override(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        scale.$;
      });

      const base = root.createComputePipeline({ compute: entry });
      const variant = base.createVariant({ overrides: [[scale, 2]] });

      const restoredBase = roundTrip(base, root);
      const restoredVariant = roundTrip(variant, root);
      const [baseRaw, variantRaw] = device.mock.createComputePipeline.mock.results.map(
        (r) => r.value,
      );

      expect(device.mock.createComputePipeline).toHaveBeenCalledTimes(2);
      expect(root.unwrap(restoredBase)).toBe(baseRaw);
      expect(root.unwrap(restoredVariant)).toBe(variantRaw);
      expect(() =>
        restoredVariant.createVariant({ overrides: [[scale, 3]] }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Cannot create variants of a restored pipeline.]`,
      );
    });

    it('returns the same pipeline type from createVariant', ({ root }) => {
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {});
      const pipeline = root.createComputePipeline({ compute: entry });
      expectTypeOf(pipeline.createVariant({})).toEqualTypeOf(pipeline);
    });
  });

  describe('render pipelines', () => {
    it('passes values provided at creation to both stages', ({ root, device }) => {
      const { tint, vertex, fragment } = createRenderSetup(root);

      root
        .createRenderPipeline({
          vertex,
          fragment,
          targets: { format: 'rgba8unorm' },
          overrides: [[tint, 0.5]],
        })
        .withColorAttachment({ view: {} as GPUTextureView })
        .draw(3);

      expect(renderConstantsOf(device.mock.createRenderPipeline.mock.calls[0])).toEqual({
        vertex: { tint: 0.5 },
        fragment: { tint: 0.5 },
      });
    });

    it('omits constants when no values are provided', ({ root, device }) => {
      const { pipeline } = createRenderSetup(root);

      pipeline.draw(3);

      const [descriptor] = device.mock.createRenderPipeline.mock.calls[0] as unknown as [
        GPURenderPipelineDescriptor,
      ];
      expect(descriptor.vertex).not.toHaveProperty('constants');
      expect(descriptor.fragment).not.toHaveProperty('constants');
    });

    it('merges and chains variants, sharing one shader module', ({ root, device }) => {
      const { tint, useFog, pipeline } = createRenderSetup(root);

      const tinted = pipeline.createVariant({ overrides: [[tint, 0.25]] });
      const foggy = tinted.createVariant({ overrides: [[useFog, true]] });

      pipeline.draw(3);
      foggy.draw(3);
      foggy.draw(3);

      // `tinted` is never used, so it never compiles
      expect(root.device.createShaderModule).toHaveBeenCalledTimes(1);
      expect(root.device.createPipelineLayout).toHaveBeenCalledTimes(1);
      expect(
        device.mock.createRenderPipeline.mock.calls.map((call) => renderConstantsOf(call).fragment),
      ).toEqual([undefined, { tint: 0.25, useFog: 1 }]);
    });

    it('compiles exactly one pipeline per variant', ({ root }) => {
      const { useFog, pipeline } = createRenderSetup(root);

      const a = pipeline.createVariant({ overrides: [[useFog, true]] });
      const b = pipeline.createVariant({ overrides: [[useFog, true]] });
      a.draw(3);
      a.draw(3);
      b.draw(3);

      expect(root.device.createShaderModule).toHaveBeenCalledTimes(1);
      expect(root.device.createRenderPipeline).toHaveBeenCalledTimes(2);
    });

    it('compiles variants asynchronously', async ({ root, device }) => {
      const { tint, pipeline } = createRenderSetup(root);

      const variant = pipeline.createVariant({ overrides: [[tint, 2]] });
      await Promise.all([pipeline.initAsync(), variant.initAsync()]);
      variant.draw(3);

      expect(root.device.createShaderModule).toHaveBeenCalledTimes(1);
      expect(root.device.createRenderPipelineAsync).toHaveBeenCalledTimes(2);
      expect(root.device.createRenderPipeline).not.toHaveBeenCalled();
      expect(
        device.mock.createRenderPipelineAsync.mock.calls.map(
          (call) => renderConstantsOf(call).vertex,
        ),
      ).toEqual([undefined, { tint: 2 }]);
    });

    it('carries priors over to variants', ({ root }) => {
      const vertexLayout = tgpu.vertexLayout(d.arrayOf(d.vec2f));
      const vertexBuffer = root.createBuffer(vertexLayout.schemaForCount(3)).$usage('vertex');
      const tint = tgpu['~unstable'].override(d.f32, 1);
      const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f(tint.$));

      const base = root
        .createRenderPipeline({
          attribs: { position: vertexLayout.attrib },
          vertex: ({ position }) => {
            'use gpu';
            return { $position: d.vec4f(position, 0, 1) };
          },
          fragment,
          targets: { format: 'rgba8unorm' },
        })
        .with(vertexLayout, vertexBuffer)
        .withColorAttachment({ view: {} as GPUTextureView });
      const variant = base.createVariant({ overrides: [[tint, 0.5]] });

      // Would throw MissingVertexBuffersError if the vertex buffer was not carried over
      expect(() => variant.draw(3)).not.toThrow();
    });

    it('throws when no value is available', ({ root }) => {
      const tint = tgpu['~unstable'].override(d.f32).$name('tint');
      const vertex = tgpu.vertexFn({ out: { pos: d.builtin.position } })(() => {
        return { pos: d.vec4f() };
      });
      const fragment = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f(tint.$));
      const pipeline = root
        .createRenderPipeline({ vertex, fragment, targets: { format: 'rgba8unorm' } })
        .withColorAttachment({ view: {} as GPUTextureView });

      expect(() => pipeline.draw(3)).toThrow(MissingOverridesError);
      expect(() => pipeline.createVariant({ overrides: [[tint, 1]] }).draw(3)).not.toThrow();
    });

    it('cannot create variants of a restored pipeline', ({ root }) => {
      const { tint, vertex, fragment } = createRenderSetup(root);
      // Attachments are bound to the runtime, so they cannot cross the boundary
      const pipeline = root.createRenderPipeline({
        vertex,
        fragment,
        targets: { format: 'rgba8unorm' },
      });
      const variant = pipeline.createVariant({ overrides: [[tint, 0.5]] });

      const restored = roundTrip(variant, root);
      expect(root.unwrap(restored)).toBe('mockRenderPipeline');
      expect(() =>
        restored.createVariant({ overrides: [[tint, 0.75]] }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Cannot create variants of a restored pipeline.]`,
      );
    });
  });
});
