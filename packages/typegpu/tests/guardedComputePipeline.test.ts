import { tgpu } from 'typegpu';
import { f32 } from 'typegpu/data';
import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';

describe('TgpuGuardedComputePipeline', () => {
  it('can be named', ({ root }) => {
    const pipeline = root
      .createGuardedComputePipeline(() => {
        'use gpu';
      })
      .$name('myPipeline');

    expect(root.unwrap(pipeline.pipeline).label).toBe('myPipeline');
  });

  it('can be named after filling a bind group', ({ root }) => {
    const myBindGroupLayout = tgpu.bindGroupLayout({ a: { uniform: f32 } });
    const myBindGroup = root.createBindGroup(myBindGroupLayout, {
      a: root.createBuffer(f32).$usage('uniform'),
    });
    const pipeline = root
      .createGuardedComputePipeline(() => {
        'use gpu';
      })
      .with(myBindGroup)
      .$name('myPipeline');

    expect(root.unwrap(pipeline.pipeline).label).toBe('myPipeline');
  });

  it('delegates `withPerformanceCallback` to the underlying pipeline', ({ root }) => {
    const callback = vi.fn();
    const guarded = root.createGuardedComputePipeline(() => {
      'use gpu';
    });

    const spy = vi.spyOn(guarded.pipeline, 'withPerformanceCallback');
    guarded.withPerformanceCallback(callback);

    expect(spy).toHaveBeenCalledWith(callback);
  });

  it('rejects differently-sized dispatches recorded into one encoder', ({ root }) => {
    const guarded = root.createGuardedComputePipeline((_x: number) => {
      'use gpu';
    });

    const encoder = root['~unstable'].createCommandEncoder();
    const batched = guarded.with(encoder);

    batched.dispatchThreads(1);
    expect(() => batched.dispatchThreads(512)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Differently-sized dispatchThreads calls cannot be batched into one submission, since they share a size uniform and every recorded dispatch observes the last written size. Submit between the dispatches, or use separate pipelines.]`,
    );

    encoder.submit();
    expect(() => batched.dispatchThreads(512)).not.toThrow();
  });

  it('allows same-sized dispatches recorded into one pass', ({ root }) => {
    const guarded = root.createGuardedComputePipeline((_x: number) => {
      'use gpu';
    });

    const encoder = root['~unstable'].createCommandEncoder();
    const pass = encoder.beginComputePass();
    const batched = guarded.with(pass);

    batched.dispatchThreads(64);
    expect(() => batched.dispatchThreads(64)).not.toThrow();
    expect(() => batched.dispatchThreads(65)).toThrow();
  });

  it('delegates `withTimestampWrites` to the underlying pipeline', ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 2);
    const guarded = root.createGuardedComputePipeline(() => {
      'use gpu';
    });

    const options = {
      querySet,
      beginningOfPassWriteIndex: 0,
      endOfPassWriteIndex: 1,
    };

    const spy = vi.spyOn(guarded.pipeline, 'withTimestampWrites');
    guarded.withTimestampWrites(options);

    expect(spy).toHaveBeenCalledWith(options);
  });
});
