import { describe, expect } from 'vitest';
import { it } from './utils/extendedIt.ts';
import { getName } from '../src/shared/meta.ts';
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
});
