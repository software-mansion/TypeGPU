import { describe, expect, it, vi } from 'vitest';
import type { TgpuBindGroup, TgpuComputePass, TgpuComputePipeline } from 'typegpu';
import {
  recordDispatch,
  type PreparedDispatch,
} from '../../src/examples/image-processing/monocular-light-injection/inference/execution-plan.ts';

function mockPipeline() {
  const pipeline = {
    with: vi.fn(),
    dispatchWorkgroups: vi.fn(),
  };
  pipeline.with.mockReturnValue(pipeline);
  return pipeline;
}

describe('recordDispatch', () => {
  it('binds prepared resources and dispatches all workgroup dimensions', () => {
    const pipeline = mockPipeline();
    const pass = { end: vi.fn() };
    const bindGroupA = {} as TgpuBindGroup;
    const bindGroupB = {} as TgpuBindGroup;
    const dispatches: PreparedDispatch[] = [
      {
        pipeline: pipeline as unknown as TgpuComputePipeline,
        bindGroup: bindGroupA,
        workgroups: { x: 3 },
      },
      {
        pipeline: pipeline as unknown as TgpuComputePipeline,
        bindGroup: bindGroupB,
        workgroups: { x: 4, y: 2 },
      },
    ];
    for (const dispatch of dispatches) {
      recordDispatch(pass as unknown as TgpuComputePass, dispatch);
    }

    expect(pipeline.with.mock.calls).toEqual([[pass], [bindGroupA], [pass], [bindGroupB]]);
    expect(pipeline.dispatchWorkgroups.mock.calls).toEqual([
      [3, 1, 1],
      [4, 2, 1],
    ]);
    expect(pass.end).not.toHaveBeenCalled();
  });
});
