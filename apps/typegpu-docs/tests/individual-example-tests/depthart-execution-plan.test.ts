import { describe, expect, it, vi } from 'vitest';
import type { TgpuBindGroup, TgpuComputePipeline } from 'typegpu';
import {
  PreparedDispatchSequence,
  type PreparedDispatch,
} from '../../src/examples/image-processing/monocular-light-injection/inference/execution-plan.ts';

function mockPipeline() {
  const pipeline = {
    with: vi.fn(),
    dispatchWorkgroups: vi.fn(),
    initSync: vi.fn(),
    initAsync: vi.fn(async () => {}),
  };
  pipeline.with.mockReturnValue(pipeline);
  return pipeline;
}

describe('PreparedDispatchSequence', () => {
  it('deduplicates initialization and records prepared dispatches in order', async () => {
    const pipeline = mockPipeline();
    const pass = { end: vi.fn() };
    const bindGroupA = {} as TgpuBindGroup;
    const bindGroupB = {} as TgpuBindGroup;
    const dispatches: PreparedDispatch[] = [
      {
        pipeline: pipeline as unknown as TgpuComputePipeline,
        bindGroups: [bindGroupA],
        workgroups: { x: 3 },
        label: 'first',
      },
      {
        pipeline: pipeline as unknown as TgpuComputePipeline,
        bindGroups: [bindGroupB],
        workgroups: { x: 4, y: 2 },
        label: 'second',
      },
    ];
    const sequence = new PreparedDispatchSequence(dispatches, []);

    expect(sequence.dispatchCount).toBe(2);
    expect(sequence.pipelineCount).toBe(1);
    sequence.initSync();
    await sequence.initAsync();
    sequence.encode(pass as unknown as GPUComputePassEncoder);

    expect(pipeline.initSync).toHaveBeenCalledOnce();
    expect(pipeline.initAsync).toHaveBeenCalledOnce();
    expect(pipeline.with.mock.calls).toEqual([[pass], [bindGroupA], [pass], [bindGroupB]]);
    expect(pipeline.dispatchWorkgroups.mock.calls).toEqual([
      [3, 1, 1],
      [4, 2, 1],
    ]);
    expect(pass.end).not.toHaveBeenCalled();
  });

  it('destroys deduplicated resources once and refuses to record afterwards', () => {
    const pipeline = mockPipeline();
    const pass = { end: vi.fn() };
    const resource = { destroy: vi.fn() };
    const sequence = new PreparedDispatchSequence(
      [
        {
          pipeline: pipeline as unknown as TgpuComputePipeline,
          bindGroups: [],
          workgroups: { x: 1 },
        },
      ],
      [resource, resource],
    );

    sequence.destroy();
    sequence.destroy();
    expect(resource.destroy).toHaveBeenCalledOnce();
    expect(() => sequence.encode(pass as unknown as GPUComputePassEncoder)).toThrow(
      'Depth inference plan has been destroyed.',
    );
  });
});
