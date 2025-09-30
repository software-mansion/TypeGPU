import { beforeEach, describe, expect, type TestAPI, vi } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu, {
  prepareDispatch,
  type TgpuComputePipeline,
  type TgpuRenderPipeline,
} from '../src/index.ts';
import { $internal } from '../src/shared/symbols.ts';
import { it } from './utils/extendedIt.ts';
import type { RenderPass } from '../src/core/root/rootTypes.ts';

describe('Batch', () => {
  const entryFn = tgpu['~unstable'].computeFn({ workgroupSize: [7] })(() => {});
  const vertexFn = tgpu['~unstable'].vertexFn({
    out: { pos: d.builtin.position },
  })(() => {
    return { pos: d.vec4f() };
  });
  const fragmentFn = tgpu['~unstable'].fragmentFn({
    out: d.vec4f,
  })(() => d.vec4f());

  let renderPipeline: TgpuRenderPipeline;
  let computePipeline: TgpuComputePipeline;

  type ExtendedTestContext<T> = T extends TestAPI<infer U> ? U : never;
  beforeEach<ExtendedTestContext<typeof it>>(({ root }) => {
    renderPipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      });
    computePipeline = root
      .withCompute(entryFn)
      .createPipeline();
  });

  it('flushes only once when used without performance callback', ({ root }) => {
    const flushMock = vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      renderPipeline.draw(7);
      computePipeline.dispatchWorkgroups(7);
      renderPipeline.draw(7);
      expect(flushMock).toBeCalledTimes(0);
    });

    expect(flushMock).toBeCalledTimes(1);
  });

  it('flushes only once when used with performance callbacks and callbacks are invoked', async ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 2);

    let resolve: () => void;
    let donePerformancing: Promise<void>;
    donePerformancing = new Promise<void>((r) => {
      resolve = r;
    });
    const callback = vi.fn(() => {
      resolve();
    });

    const renderPipelineWithPerformance = renderPipeline
      .withPerformanceCallback(callback);

    const renderPipelineWithTimestampWrites = renderPipeline
      .withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      });

    const flushMock = vi.spyOn(root[$internal], 'flush');

    // trying different permutations
    root.batch(() => {
      computePipeline.dispatchWorkgroups(7);
      renderPipelineWithPerformance.draw(7);
      renderPipelineWithTimestampWrites.draw(7);
      expect(flushMock).toBeCalledTimes(0);
      expect(callback).toBeCalledTimes(0);
    });

    // first from batch itself, second from querySet.read
    expect(flushMock).toBeCalledTimes(2);
    await donePerformancing;
    expect(callback).toBeCalledTimes(1);

    flushMock.mockClear();
    callback.mockClear();
    donePerformancing = new Promise<void>((r) => {
      resolve = r;
    });

    root.batch(() => {
      renderPipelineWithPerformance.draw(7);
      computePipeline.dispatchWorkgroups(7);
      renderPipelineWithTimestampWrites.draw(7);
      expect(flushMock).toBeCalledTimes(0);
      expect(callback).toBeCalledTimes(0);
    });

    // first from batch, second from querySet.read
    expect(flushMock).toBeCalledTimes(2);
    await donePerformancing;
    expect(callback).toBeCalledTimes(1);

    flushMock.mockClear();
    callback.mockClear();
    donePerformancing = new Promise<void>((r) => {
      resolve = r;
    });

    root.batch(() => {
      renderPipelineWithTimestampWrites.draw(7);
      computePipeline.dispatchWorkgroups(7);
      renderPipelineWithPerformance.draw(7);
      expect(flushMock).toBeCalledTimes(0);
      expect(callback).toBeCalledTimes(0);
    });

    // first from batch, second from querySet.read
    expect(flushMock).toBeCalledTimes(2);
    await donePerformancing;
    expect(callback).toBeCalledTimes(1);
  });

  it('flushes properly with drawIndexed', async ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 2);
    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 2)).$usage('index');

    let resolve: () => void;
    const donePerformancing = new Promise<void>((r) => {
      resolve = r;
    });
    const callback = vi.fn(() => {
      resolve();
    });

    const renderPipeline1 = renderPipeline.withIndexBuffer(indexBuffer);
    const renderPipeline2 = renderPipeline
      .withPerformanceCallback(callback)
      .withIndexBuffer(indexBuffer);
    const renderPipeline3 = renderPipeline
      .withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      })
      .withIndexBuffer(indexBuffer);

    const flushMock = vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      renderPipeline1.drawIndexed(7);
      renderPipeline2.drawIndexed(7);
      renderPipeline3.drawIndexed(7);
      expect(flushMock).toBeCalledTimes(0);
      expect(callback).toBeCalledTimes(0);
    });

    // first from batch, second from querySet.read
    expect(flushMock).toBeCalledTimes(2);
    await donePerformancing;
    expect(callback).toBeCalledTimes(1);
  });

  it('flushes properly with beginRenderPass', ({ root }) => {
    const bindGroupLayout = tgpu.bindGroupLayout({});
    const bindGroup = root.createBindGroup(bindGroupLayout, {});

    const renderPassArgs: Parameters<typeof root['beginRenderPass']> = [
      { colorAttachments: [] },
      (pass: RenderPass) => {
        pass.setPipeline(renderPipeline);
        pass.setBindGroup(bindGroupLayout, bindGroup);
        pass.draw(7);
      },
    ];

    const flushMock = vi.spyOn(root[$internal], 'flush');

    root['~unstable'].beginRenderPass(...renderPassArgs);
    expect(flushMock).toBeCalledTimes(1);

    root['~unstable'].beginRenderPass(...renderPassArgs);
    expect(flushMock).toBeCalledTimes(2);

    flushMock.mockClear();

    root['~unstable'].batch(() => {
      root['~unstable'].beginRenderPass(...renderPassArgs);
      root['~unstable'].beginRenderPass(...renderPassArgs);
      expect(flushMock).toBeCalledTimes(0);
    });
    expect(flushMock).toBeCalledTimes(1);
  });

  it('flushes immediately after read-write operation', ({ root }) => {
    const wBuffer = root.createBuffer(d.arrayOf(d.u32, 7));
    const rBuffer = root.createBuffer(d.u32, 7);

    const flushMock = vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      wBuffer.write([1, 2, 3, 4, 5, 6, 7]);
      expect(flushMock).toBeCalledTimes(1);
      wBuffer.writePartial([{ idx: 6, value: 1882 }]);
      expect(flushMock).toBeCalledTimes(2);
      rBuffer.read();
      expect(flushMock).toBeCalledTimes(3);
    });
    expect(flushMock).toBeCalledTimes(4);
  });

  it('handles nested batches with performance callbacks', async ({ root }) => {
    const callback1 = () => {};
    const callback2 = () => {};
    const callback3 = () => {};

    const renderPipelineWithPerformance1 = renderPipeline
      .withPerformanceCallback(callback1);
    const renderPipelineWithPerformance2 = renderPipeline
      .withPerformanceCallback(callback2);
    const renderPipelineWithPerformance3 = renderPipeline
      .withPerformanceCallback(callback3);

    const flushMock = vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      renderPipelineWithPerformance1.draw(7);
      expect(root[$internal].batchState.performanceCallbacks.length).toBe(1);
      root.batch(() => {
        renderPipelineWithPerformance2.draw(7);
        expect(root[$internal].batchState.performanceCallbacks.length).toBe(2);
      });

      // first one from batch, second one from querySet.read
      expect(flushMock).toBeCalledTimes(2);
      expect(root[$internal].batchState.performanceCallbacks.length).toBe(1);

      renderPipelineWithPerformance3.draw(7);

      expect(root[$internal].batchState.performanceCallbacks.length).toBe(2);
    });

    expect(flushMock).toBeCalledTimes(5);
    expect(root[$internal].batchState.performanceCallbacks.length).toBe(0);
  });

  it('clears callback stack at the end of batch', async ({ root }) => {
    let resolve1: () => void;
    const donePerformancing1 = new Promise<void>((r) => {
      resolve1 = r;
    });
    const callback1 = vi.fn(() => {
      resolve1();
    });
    let resolve2: () => void;
    const donePerformancing2 = new Promise<void>((r) => {
      resolve2 = r;
    });
    const callback2 = vi.fn(() => {
      resolve2();
    });
    let resolve3: () => void;
    const donePerformancing3 = new Promise<void>((r) => {
      resolve3 = r;
    });
    const callback3 = vi.fn(() => {
      resolve3();
    });
    let resolve4: () => void;
    const donePerformancing4 = new Promise<void>((r) => {
      resolve4 = r;
    });
    const callback4 = vi.fn(() => {
      resolve4();
    });

    const renderPipelineWithPerformance1 = renderPipeline
      .withPerformanceCallback(callback1);
    const renderPipelineWithPerformance2 = renderPipeline
      .withPerformanceCallback(callback2);
    const renderPipelineWithPerformance3 = renderPipeline
      .withPerformanceCallback(callback3);
    const renderPipelineWithPerformance4 = renderPipeline
      .withPerformanceCallback(callback4);

    root.batch(() => {
      renderPipelineWithPerformance1.draw(7);
      renderPipelineWithPerformance2.draw(7);
    });

    await Promise.all([
      donePerformancing1,
      donePerformancing2,
    ]);

    expect(callback1).toBeCalledTimes(1);
    expect(callback2).toBeCalledTimes(1);
    expect(callback3).toBeCalledTimes(0);
    expect(callback4).toBeCalledTimes(0);

    expect(root[$internal].batchState.performanceCallbacks.length).toBe(0);

    root.batch(() => {
      renderPipelineWithPerformance3.draw(7);
      renderPipelineWithPerformance4.draw(7);
    });

    await Promise.all([
      donePerformancing3,
      donePerformancing4,
    ]);

    expect(callback1).toBeCalledTimes(1);
    expect(callback2).toBeCalledTimes(1);
    expect(callback3).toBeCalledTimes(1);
    expect(callback4).toBeCalledTimes(1);
    expect(root[$internal].batchState.performanceCallbacks.length).toBe(0);
  });

  it('handles prepareDispatch().dispatch', ({ root }) => {
    const flushMock = vi.spyOn(root[$internal], 'flush');

    prepareDispatch(root, () => {
      'kernel';
    }).dispatch();
    expect(flushMock).toBeCalledTimes(1);

    root['~unstable'].batch(() => {
      prepareDispatch(root, () => {
        'kernel';
      }).dispatch();
      // from write inside dispatch
      expect(flushMock).toBeCalledTimes(2);
    });
    expect(flushMock).toBeCalledTimes(3);
  });

  it('flushes immediately after pipeline with console.log', ({ device }) => {
    const root = tgpu.initFromDevice({
      device,
      unstable_logOptions: {
        logCountLimit: 32,
        logSizeLimit: 8,
      },
    });
    const f = tgpu['~unstable'].computeFn({ workgroupSize: [1] })(() => {
      console.log(d.u32(7));
    });
    const pipeline = root['~unstable'].withCompute(f).createPipeline();

    const flushMock = vi.spyOn(root[$internal], 'flush');

    pipeline.dispatchWorkgroups(1, 1, 1);
    expect(flushMock).not.toBeCalledTimes(0);

    flushMock.mockClear();

    root['~unstable'].batch(() => {
      pipeline.dispatchWorkgroups(1, 1, 1);
      expect(flushMock).not.toBeCalledTimes(0);
    });
  });

  it('restores auto-flush', ({ root }) => {
    const flushMock = vi.spyOn(root[$internal], 'flush');

    computePipeline.dispatchWorkgroups(7, 7, 7);
    expect(flushMock).toBeCalledTimes(1);

    root.batch(() => {
      computePipeline.dispatchWorkgroups(7, 7, 7);
      expect(flushMock).toBeCalledTimes(1);
    });
    expect(flushMock).toBeCalledTimes(2);

    computePipeline.dispatchWorkgroups(7, 7, 7);
    expect(flushMock).toBeCalledTimes(3);
  });
});
