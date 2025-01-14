import { describe, expect, expectTypeOf } from 'vitest';
import { computeFn } from '../src/core/function/tgpuComputeFn';
import type { TgpuComputePipeline } from '../src/core/pipeline/computePipeline';
import { it } from './utils/extendedIt';

describe('TgpuComputePipeline', () => {
  it('can be created with a compute entry function', ({ root, device }) => {
    const entryFn = computeFn([], { workgroupSize: [32] })
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
});
