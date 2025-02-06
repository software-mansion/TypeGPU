import { describe, expect, expectTypeOf } from 'vitest';
import tgpu, { MissingBindGroupsError, type TgpuComputePipeline } from '../src';
import * as d from '../src/data';
import { it } from './utils/extendedIt';

describe('TgpuComputePipeline', () => {
  it('can be created with a compute entry function', ({ root, device }) => {
    const entryFn = tgpu['~unstable']
      .computeFn({}, { workgroupSize: [32] })
      .does(() => {
        // do something
      })
      .$name('main');

    const computePipeline = root
      .withCompute(entryFn)
      .createPipeline()
      .$name('test_pipeline');

    expectTypeOf(computePipeline).toEqualTypeOf<TgpuComputePipeline>();

    root.unwrap(computePipeline);

    expect(root.device.createComputePipeline).toBeCalledWith({
      compute: {
        module: device.mock.createShaderModule(),
      },
      label: 'test_pipeline',
      layout: device.mock.createPipelineLayout(),
    });
  });

  it('throws an error if bind groups are missing', ({ root }) => {
    const layout = tgpu
      .bindGroupLayout({ alpha: { uniform: d.f32 } })
      .$name('example-layout');

    const entryFn = tgpu['~unstable']
      .computeFn({}, { workgroupSize: [1] })
      .does(() => {
        layout.bound.alpha; // Using an entry of the layout
      })
      .$name('main');

    const pipeline = root.withCompute(entryFn).createPipeline();

    expect(() => pipeline.dispatchWorkgroups(1)).toThrowError(
      new MissingBindGroupsError([layout]),
    );

    expect(() =>
      pipeline.dispatchWorkgroups(1),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Missing bind groups for layouts: 'example-layout'. Please provide it using pipeline.with(layout, bindGroup).(...)]`,
    );
  });
});
