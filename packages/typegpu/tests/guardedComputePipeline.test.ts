import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { getName } from '../src/shared/meta.ts';
import { $internal } from '../src/shared/symbols.ts';
import { bindGroupLayout } from '../src/tgpuBindGroupLayout.ts';
import { f32 } from '../src/data/numeric.ts';

describe('TgpuGuardedComputePipeline', () => {
  it('can be named', ({ root }) => {
    const pipeline = root
      .createGuardedComputePipeline(() => {
        'use gpu';
      })
      .$name('myPipeline');

    expect(getName(pipeline)).toBe('myPipeline');
    expect(getName(pipeline.pipeline)).toBe('myPipeline');
  });

  it('can be named after filling a bind group', ({ root }) => {
    const myBindGroupLayout = bindGroupLayout({ a: { uniform: f32 } });
    const myBindGroup = root.createBindGroup(myBindGroupLayout, {
      a: root.createBuffer(f32).$usage('uniform'),
    });
    const pipeline = root
      .createGuardedComputePipeline(() => {
        'use gpu';
      })
      .with(myBindGroup)
      .$name('myPipeline');

    expect(getName(pipeline)).toBe('myPipeline');
    expect(getName(pipeline.pipeline)).toBe('myPipeline');
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
