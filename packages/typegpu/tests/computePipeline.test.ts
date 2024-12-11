import { describe, expect, expectTypeOf } from 'vitest';
import type { TgpuComputePipeline } from '../src/core/pipeline/computePipeline';
import tgpu from '../src/experimental';
import { it } from './utils/myIt';

describe('TgpuComputePipeline', () => {
  it('can be created with a compute entry function', ({ root }) => {
    const entryFn = tgpu
      .computeFn([], { workgroupSize: [32] })
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
        module: root.mockDevice.createShaderModule(),
      },
      label: 'test_pipeline',
      layout: root.mockDevice.createPipelineLayout(),
    });
  });
});
