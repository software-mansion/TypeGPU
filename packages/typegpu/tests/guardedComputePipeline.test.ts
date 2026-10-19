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

  it('rejects passes and encoders in .with()', ({ root }) => {
    const guarded = root.createGuardedComputePipeline((_x: number) => {
      'use gpu';
    });

    const encoder = root['~unstable'].createCommandEncoder();
    const pass = encoder.beginComputePass();

    // @ts-expect-error guarded pipelines only accept bind groups
    expect(() => guarded.with(encoder)).toThrowErrorMatchingInlineSnapshot(
      `[Error: Guarded pipelines only accept bind groups in .with(). To record into passes or encoders, use a regular compute pipeline.]`,
    );
    // @ts-expect-error guarded pipelines only accept bind groups
    expect(() => guarded.with(pass)).toThrow();
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
