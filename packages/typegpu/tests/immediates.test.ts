import { describe, expect, type Mock } from 'vitest';
import { tgpu, d, MissingImmediatesError } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('tgpu.immediateVar', () => {
  const tint = tgpu['~unstable'].immediateVar(d.f32);

  const mainVertex = tgpu.vertexFn({
    out: { pos: d.builtin.position },
  })(() => {
    tint.$;
    return { pos: d.vec4f() };
  });

  const mainFragment = tgpu.fragmentFn({ out: d.vec4f })(() => d.vec4f());

  function trackWrites(setImmediates: Mock): number[][] {
    const writes: number[][] = [];
    setImmediates.mockImplementation((...args: unknown[]) => {
      writes.push([...new Float32Array(args[1] as ArrayBuffer)]);
    });
    return writes;
  }

  describe('resolution', () => {
    it('resolves to a var<immediate> declaration without bindings', () => {
      const level = tgpu['~unstable'].immediateVar(d.f32);
      const fn1 = tgpu.fn([], d.f32)(() => level.$);

      const resolved = tgpu.resolve([fn1]);
      expect(resolved).toContain('var<immediate> level: f32;');
      expect(resolved).not.toContain('@group');
    });

    it('does not emit the default value as an initializer', () => {
      const level = tgpu['~unstable'].immediateVar(d.f32, 0.5);
      const fn1 = tgpu.fn([], d.f32)(() => level.$);

      expect(tgpu.resolve([fn1])).toContain('var<immediate> level: f32;');
    });

    it('allows aliasing a struct immediate in a variable declaration', () => {
      const Params = d.struct({ intensity: d.f32, color: d.vec3f });
      const params = tgpu['~unstable'].immediateVar(Params);
      const fn1 = tgpu.fn(
        [],
        d.vec3f,
      )(() => {
        'use gpu';
        const p = params.$;
        return p.color * p.intensity;
      });

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "struct Params {
          intensity: f32,
          color: vec3f,
        }

        var<immediate> params: Params;

        fn fn1() -> vec3f {
          let p = (&params);
          return ((*p).color * (*p).intensity);
        }"
      `);
    });

    it('allows aliasing a vector immediate in a variable declaration', () => {
      const offset = tgpu['~unstable'].immediateVar(d.vec4f);
      const fn1 = tgpu.fn(
        [],
        d.vec2f,
      )(() => {
        'use gpu';
        const o = offset.$;
        return o.xy * o.w;
      });

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "var<immediate> offset: vec4f;

        fn fn1() -> vec2f {
          let o = (&offset);
          return ((*o).xy * (*o).w);
        }"
      `);
    });

    it('throws when two different immediate variables are used in one shader', () => {
      const first = tgpu['~unstable'].immediateVar(d.f32);
      const second = tgpu['~unstable'].immediateVar(d.f32);
      const fn1 = tgpu.fn([], d.f32)(() => first.$ + second.$);

      expect(() => tgpu.resolve([fn1])).toThrow(
        /Cannot use both immediate variables 'first' and 'second' in a single shader/,
      );
    });

    it('allows using the same immediate variable in multiple functions', () => {
      const level = tgpu['~unstable'].immediateVar(d.f32);
      const inner = tgpu.fn([], d.f32)(() => level.$);
      const outer = tgpu.fn([], d.f32)(() => inner() + level.$);

      const resolved = tgpu.resolve([outer]);
      expect(resolved).toContain('var<immediate> level: f32;');
    });

    it('throws when mutating an immediate variable in a shader', () => {
      const level = tgpu['~unstable'].immediateVar(d.f32);
      const fn1 = tgpu.fn([])(() => {
        // @ts-expect-error: immediates are read-only
        level.$ = 1;
      });

      expect(() => tgpu.resolve([fn1])).toThrow(/immediate variables cannot be mutated/);
    });
  });

  describe('schema validation', () => {
    it('rejects arrays', () => {
      expect(() => tgpu['~unstable'].immediateVar(d.arrayOf(d.f32, 4))).toThrow(
        /immediates cannot contain arrays/,
      );
    });

    it('rejects nested arrays', () => {
      const Nested = d.struct({ inner: d.struct({ values: d.arrayOf(d.f32, 4) }) });
      expect(() => tgpu['~unstable'].immediateVar(Nested)).toThrow(
        /immediates cannot contain arrays/,
      );
    });

    it('rejects atomics', () => {
      expect(() => tgpu['~unstable'].immediateVar(d.struct({ counter: d.atomic(d.u32) }))).toThrow(
        /immediates cannot contain atomics/,
      );
    });

    it('rejects booleans and boolean vectors', () => {
      expect(() => tgpu['~unstable'].immediateVar(d.bool)).toThrow(
        /immediates cannot contain booleans/,
      );
      expect(() => tgpu['~unstable'].immediateVar(d.vec3b)).toThrow(
        /immediates cannot contain booleans/,
      );
      expect(() => tgpu['~unstable'].immediateVar(d.struct({ flag: d.bool }))).toThrow(
        /immediates cannot contain booleans/,
      );
    });
  });

  describe('normal-mode access', () => {
    it('throws when accessed outside of codegen', () => {
      const level = tgpu['~unstable'].immediateVar(d.f32, 0.5);
      expect(() => level.$).toThrow(/can only be accessed as part of a draw call/);
    });
  });

  describe('compute pipelines', () => {
    it('passes immediateSize to createPipelineLayout', ({ root }) => {
      const offset = tgpu['~unstable'].immediateVar(d.vec3f, d.vec3f());
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        offset.$;
      });

      root.createComputePipeline({ compute: entry }).dispatchWorkgroups(1);

      expect(root.device.createPipelineLayout).toBeCalledWith(
        expect.objectContaining({ immediateSize: 12 }),
      );
    });

    it('includes struct member padding in immediateSize', ({ root }) => {
      const Params = d.struct({ intensity: d.f32, color: d.vec3f });
      const params = tgpu['~unstable'].immediateVar(Params, {
        intensity: 0.5,
        color: d.vec3f(),
      });
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        params.$;
      });

      root.createComputePipeline({ compute: entry }).dispatchWorkgroups(1);

      expect(root.device.createPipelineLayout).toBeCalledWith(
        expect.objectContaining({ immediateSize: 32 }),
      );
    });

    it('serializes the value and writes it before dispatch', ({ root, computePassEncoder }) => {
      const offset = tgpu['~unstable'].immediateVar(d.vec3f);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        offset.$;
      });

      root
        .createComputePipeline({ compute: entry })
        .with(offset, d.vec3f(1, 2, 3))
        .dispatchWorkgroups(1);

      expect(computePassEncoder.mock.setImmediates).toBeCalledTimes(1);

      const [rangeOffset, data] = computePassEncoder.mock.setImmediates.mock.calls[0] as [
        number,
        ArrayBuffer,
      ];
      expect(rangeOffset).toBe(0);
      expect([...new Float32Array(data)]).toEqual([1, 2, 3]);
    });

    it('falls back to the default value when no override is given', ({
      root,
      computePassEncoder,
    }) => {
      const writes = trackWrites(computePassEncoder.mock.setImmediates);
      const level = tgpu['~unstable'].immediateVar(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        level.$;
      });

      root.createComputePipeline({ compute: entry }).dispatchWorkgroups(1);

      expect(writes).toEqual([[0.5]]);
    });

    it('prefers pipeline-level overrides over the default value', ({
      root,
      computePassEncoder,
    }) => {
      const writes = trackWrites(computePassEncoder.mock.setImmediates);
      const level = tgpu['~unstable'].immediateVar(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        level.$;
      });

      root.createComputePipeline({ compute: entry }).with(level, 0.25).dispatchWorkgroups(1);

      expect(writes).toEqual([[0.25]]);
    });

    it('throws when no value is available at dispatch', ({ root }) => {
      const level = tgpu['~unstable'].immediateVar(d.f32);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        level.$;
      });

      const pipeline = root.createComputePipeline({ compute: entry });
      expect(() => pipeline.dispatchWorkgroups(1)).toThrow(MissingImmediatesError);
    });

    it('throws when the environment does not support immediates', ({ root, navigator }) => {
      navigator.gpu.wgslLanguageFeatures.delete('immediate_address_space');

      const level = tgpu['~unstable'].immediateVar(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        level.$;
      });

      const pipeline = root.createComputePipeline({ compute: entry });
      expect(() => pipeline.dispatchWorkgroups(1)).toThrow(
        /'immediate_address_space' WGSL language extension is not supported/,
      );
    });
  });

  describe('render pipelines', () => {
    it('writes immediates before standalone draws', ({ root, renderPassEncoder }) => {
      root
        .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
        .withColorAttachment({ view: {} as unknown as GPUTextureView })
        .with(tint, 0.75)
        .draw(3);

      expect(root.device.createPipelineLayout).toBeCalledWith(
        expect.objectContaining({ immediateSize: 4 }),
      );
      expect(renderPassEncoder.mock.setImmediates).toBeCalledTimes(1);

      const [rangeOffset, data] = renderPassEncoder.mock.setImmediates.mock.calls[0] as [
        number,
        ArrayBuffer,
      ];
      expect(rangeOffset).toBe(0);
      expect([...new Float32Array(data)]).toEqual([0.75]);
    });

    it('re-writes immediates on every draw into a shared pass', ({ root, renderPassEncoder }) => {
      const writes = trackWrites(renderPassEncoder.mock.setImmediates);

      const pipeline = root.createRenderPipeline({
        vertex: mainVertex,
        fragment: mainFragment,
      });

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      pipeline.with(tint, 0.25).with(pass).draw(3);
      pipeline.with(tint, 0.75).with(pass).draw(3);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.25], [0.75]]);
    });
  });

  describe('pass-level immediates', () => {
    it('uses pass-level immediates for draws', ({ root, renderPassEncoder }) => {
      const writes = trackWrites(renderPassEncoder.mock.setImmediates);
      const pipeline = root.createRenderPipeline({ vertex: mainVertex, fragment: mainFragment });

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      pass.setImmediates(tint, 0.5);
      pipeline.with(pass).draw(3);
      pass.setImmediates(tint, 0.75);
      pipeline.with(pass).draw(3);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.5], [0.75]]);
    });

    it('captures the value at setImmediates time, not at draw time', ({
      root,
      renderPassEncoder,
    }) => {
      const pair = tgpu['~unstable'].immediateVar(d.vec2f);
      const pairVertex = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })(() => {
        pair.$;
        return { pos: d.vec4f() };
      });

      const writes = trackWrites(renderPassEncoder.mock.setImmediates);
      const pipeline = root.createRenderPipeline({ vertex: pairVertex, fragment: mainFragment });

      const value = d.vec2f(0.5, 0.25);
      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      pass.setImmediates(pair, value);
      value.x = 0.75;
      pipeline.with(pass).draw(3);
      pass.setImmediates(pair, value);
      pipeline.with(pass).draw(3);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([
        [0.5, 0.25],
        [0.75, 0.25],
      ]);
    });

    it('copies pre-serialized bytes verbatim, skipping serialization', ({
      root,
      renderPassEncoder,
    }) => {
      const writes = trackWrites(renderPassEncoder.mock.setImmediates);
      const pipeline = root.createRenderPipeline({ vertex: mainVertex, fragment: mainFragment });

      const bytes = new Float32Array([0.5]);
      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      pass.setImmediates(tint, bytes);
      pipeline.with(pass).draw(3);
      bytes[0] = 0.75;
      pass.setImmediates(tint, bytes);
      pipeline.with(pass).draw(3);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.5], [0.75]]);
    });

    it('applies pipeline-level and pass-level immediates in call order', ({
      root,
      renderPassEncoder,
    }) => {
      const writes = trackWrites(renderPassEncoder.mock.setImmediates);
      const pipeline = root.createRenderPipeline({ vertex: mainVertex, fragment: mainFragment });

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      const boundPipeline = pipeline.with(tint, 0.25).with(pass);
      pass.setImmediates(tint, 0.5);
      boundPipeline.draw(3);
      pass.setImmediates(tint, 0.75);
      boundPipeline.draw(3);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.25], [0.75]]);
    });

    it('keeps pipeline-held immediates intact when overwritten on the pass', ({
      root,
      renderPassEncoder,
    }) => {
      const writes = trackWrites(renderPassEncoder.mock.setImmediates);
      const pipeline = root.createRenderPipeline({ vertex: mainVertex, fragment: mainFragment });
      const boundPipeline = pipeline.with(tint, 0.25);

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      boundPipeline.with(pass).draw(3);
      pass.setImmediates(tint, 0.5);
      pipeline.with(pass).draw(3);
      boundPipeline.with(pass).draw(3);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.25], [0.5], [0.25]]);
    });

    it('prefers pass-level immediates over the default value', ({ root, renderPassEncoder }) => {
      const writes = trackWrites(renderPassEncoder.mock.setImmediates);
      const level = tgpu['~unstable'].immediateVar(d.f32, 0.125);
      const vertex = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })(() => {
        level.$;
        return { pos: d.vec4f() };
      });
      const pipeline = root.createRenderPipeline({ vertex, fragment: mainFragment });

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      pipeline.with(pass).draw(3);
      pass.setImmediates(level, 0.5);
      pipeline.with(pass).draw(3);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.125], [0.5]]);
    });

    it('writes immediates when drawing proxy-style', ({ root, renderPassEncoder }) => {
      const writes = trackWrites(renderPassEncoder.mock.setImmediates);
      const pipeline = root.createRenderPipeline({ vertex: mainVertex, fragment: mainFragment });

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      pass.setImmediates(tint, 0.5);
      pass.setPipeline(pipeline);
      pass.draw(3);
      pass.setPipeline(pipeline.with(tint, 0.25));
      pass.draw(3);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.5], [0.25]]);
    });

    it('re-applies pass-level immediates after executeBundles', ({ root, renderPassEncoder }) => {
      const writes = trackWrites(renderPassEncoder.mock.setImmediates);
      const pipeline = root.createRenderPipeline({ vertex: mainVertex, fragment: mainFragment });

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      pass.setImmediates(tint, 0.5);
      const bound = pipeline.with(pass);
      bound.draw(3);
      pass.executeBundles([]);
      bound.draw(3);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.5], [0.5]]);
    });

    it('uses pass-level immediates for dispatches', ({ root, computePassEncoder }) => {
      const writes = trackWrites(computePassEncoder.mock.setImmediates);
      const offset = tgpu['~unstable'].immediateVar(d.f32);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        offset.$;
      });
      const pipeline = root.createComputePipeline({ compute: entry });

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setImmediates(offset, 0.5);
      pipeline.with(pass).dispatchWorkgroups(1);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.5]]);
    });

    it('writes immediates when dispatching proxy-style', ({ root, computePassEncoder }) => {
      const writes = trackWrites(computePassEncoder.mock.setImmediates);
      const offset = tgpu['~unstable'].immediateVar(d.f32);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        offset.$;
      });
      const pipeline = root.createComputePipeline({ compute: entry });

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginComputePass();
      pass.setImmediates(offset, 0.75);
      pass.setPipeline(pipeline);
      pass.dispatchWorkgroups(1);
      pass.end();
      encoder.submit();

      expect(writes).toEqual([[0.75]]);
    });
  });

  describe('snapshot skip cache', () => {
    it('skips re-writing an unchanged snapshot into a shared pass', ({
      root,
      renderPassEncoder,
    }) => {
      const pipeline = root
        .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
        .with(tint, 0.5);

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      const bound = pipeline.with(pass);
      bound.draw(3);
      bound.draw(3);
      pass.end();
      encoder.submit();

      expect(renderPassEncoder.mock.setImmediates).toBeCalledTimes(1);
    });

    it('re-writes an unchanged snapshot after executeBundles', ({ root, renderPassEncoder }) => {
      const pipeline = root
        .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
        .with(tint, 0.5);

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      const bound = pipeline.with(pass);
      bound.draw(3);
      pass.executeBundles([]);
      bound.draw(3);
      pass.end();
      encoder.submit();

      expect(renderPassEncoder.mock.setImmediates).toBeCalledTimes(2);
    });

    it('does not skip writes on a raw render pass', ({ root, renderPassEncoder }) => {
      const bound = root
        .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
        .with(tint, 0.5)
        .with(renderPassEncoder);

      bound.draw(3);
      bound.draw(3);

      expect(renderPassEncoder.mock.setImmediates).toBeCalledTimes(2);
    });

    it('distinguishes immediate variables with identical values', ({ root, renderPassEncoder }) => {
      const other = tgpu['~unstable'].immediateVar(d.f32);
      const otherVertex = tgpu.vertexFn({
        out: { pos: d.builtin.position },
      })(() => {
        other.$;
        return { pos: d.vec4f() };
      });

      const pipeline1 = root
        .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
        .with(tint, 0.5);
      const pipeline2 = root
        .createRenderPipeline({ vertex: otherVertex, fragment: mainFragment })
        .with(other, 0.5);

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginRenderPass({ colorAttachments: [] });
      pipeline1.with(pass).draw(3);
      pipeline2.with(pass).draw(3);
      pass.end();
      encoder.submit();

      expect(renderPassEncoder.mock.setImmediates).toBeCalledTimes(2);
    });

    it('skips re-writing an unchanged snapshot into a shared compute pass', ({
      root,
      computePassEncoder,
    }) => {
      const offset = tgpu['~unstable'].immediateVar(d.f32);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        offset.$;
      });
      const pipeline = root.createComputePipeline({ compute: entry }).with(offset, 0.5);

      const encoder = root.createCommandEncoder();
      const pass = encoder.beginComputePass();
      const bound = pipeline.with(pass);
      bound.dispatchWorkgroups(1);
      bound.dispatchWorkgroups(1);
      pass.end();
      encoder.submit();

      expect(computePassEncoder.mock.setImmediates).toBeCalledTimes(1);
    });
  });

  describe('render bundles', () => {
    it('writes pipeline-level immediates when drawing through a bundle proxy', ({
      root,
      renderBundleEncoder,
    }) => {
      const writes = trackWrites(renderBundleEncoder.mock.setImmediates);
      const pipeline = root
        .createRenderPipeline({ vertex: mainVertex, fragment: mainFragment })
        .with(tint, 0.5);

      const pass = root['~unstable'].createRenderBundleEncoder({ colorFormats: [] });
      pass.setPipeline(pipeline);
      pass.draw(3);
      pass.draw(3);
      pass.finish();

      expect(writes).toEqual([[0.5]]);
    });

    it('uses bundle-level setImmediates for draws', ({ root, renderBundleEncoder }) => {
      const writes = trackWrites(renderBundleEncoder.mock.setImmediates);
      const pipeline = root.createRenderPipeline({ vertex: mainVertex, fragment: mainFragment });

      const pass = root['~unstable'].createRenderBundleEncoder({ colorFormats: [] });
      pass.setImmediates(tint, 0.25);
      pass.setPipeline(pipeline);
      pass.draw(3);
      pass.finish();

      expect(writes).toEqual([[0.25]]);
    });
  });

  describe('accessors', () => {
    it('resolves an accessor fulfilled by an immediate variable', () => {
      const level = tgpu.accessor(d.f32);
      const levelImmediate = tgpu['~unstable'].immediateVar(d.f32).$name('levelImmediate');
      const fn1 = tgpu
        .fn(
          [],
          d.f32,
        )(() => level.$)
        .with(level, levelImmediate);

      const resolved = tgpu.resolve([fn1]);
      expect(resolved).toContain('var<immediate> levelImmediate: f32;');
      expect(resolved).not.toContain('@group');
    });

    it('writes immediates at dispatch when fulfilling an accessor', ({
      root,
      computePassEncoder,
    }) => {
      const writes = trackWrites(computePassEncoder.mock.setImmediates);
      const level = tgpu.accessor(d.f32);
      const levelImmediate = tgpu['~unstable'].immediateVar(d.f32, 0.5);
      const entry = tgpu.computeFn({ workgroupSize: [1] })(() => {
        level.$;
      });

      root
        .with(level, levelImmediate)
        .createComputePipeline({ compute: entry })
        .dispatchWorkgroups(1);

      expect(root.device.createPipelineLayout).toBeCalledWith(
        expect.objectContaining({ immediateSize: 4 }),
      );
      expect(writes).toEqual([[0.5]]);
    });
  });
});
