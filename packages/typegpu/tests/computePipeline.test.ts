import { describe, expect, expectTypeOf } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu, {
  MissingBindGroupsError,
  type TgpuComputePipeline,
} from '../src/index.ts';
import { it } from './utils/extendedIt.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('TgpuComputePipeline', () => {
  it('can be created with a compute entry function', ({ root, device }) => {
    const entryFn = tgpu['~unstable']
      .computeFn({ workgroupSize: [32] })(() => {
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
      .computeFn({ workgroupSize: [1] })(() => {
        layout.bound.alpha; // Using an entry of the layout
      })
      .$name('main');

    const pipeline = root.withCompute(entryFn).createPipeline();

    expect(() => pipeline.dispatchWorkgroups(1)).toThrowError(
      new MissingBindGroupsError([layout]),
    );

    expect(() => pipeline.dispatchWorkgroups(1))
      .toThrowErrorMatchingInlineSnapshot(
        `[Error: Missing bind groups for layouts: 'example-layout'. Please provide it using pipeline.with(layout, bindGroup).(...)]`,
      );
  });

  it('is resolvable', ({ root }) => {
    const entryFn = tgpu['~unstable']
      .computeFn({ workgroupSize: [32] })(() => {
        // do something
      })
      .$name('main');

    const computePipeline = root
      .withCompute(entryFn)
      .createPipeline()
      .$name('test_pipeline');

    console.log(tgpu.resolve({ externals: { computePipeline } }));

    expect(parseResolved({ computePipeline })).toStrictEqual(parse(`
      @compute @workgroup_size(32) fn main() {}
    `));
  });
});
