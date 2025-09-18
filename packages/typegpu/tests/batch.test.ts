import { describe, expect, vi } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { $internal } from '../src/shared/symbols.ts';
import { it } from './utils/extendedIt.ts';

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

  it('flushes only once when used without performance callback', ({ root }) => {
    const renderPipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      });

    const computePipeline = root
      .withCompute(entryFn)
      .createPipeline();

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

    const renderPipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      });

    const renderPipelineWithPerformance = renderPipeline
      .withPerformanceCallback(callback);

    const renderPipelineWithTimestampWrites = renderPipeline
      .withTimestampWrites({
        querySet,
        beginningOfPassWriteIndex: 0,
        endOfPassWriteIndex: 1,
      });

    const computePipeline = root
      .withCompute(entryFn)
      .createPipeline();

    const flushMock = vi.spyOn(root[$internal], 'flush');

    // trying different permutations
    root.batch(() => {
      computePipeline.dispatchWorkgroups(7);
      expect(flushMock).toBeCalledTimes(0);
      renderPipelineWithPerformance.draw(7);
      expect(flushMock).toBeCalledTimes(0);
      renderPipelineWithTimestampWrites.draw(7);
      expect(flushMock).toBeCalledTimes(0);
      expect(callback).toBeCalledTimes(0);
    });

    expect(flushMock).toBeCalledTimes(1);
    await donePerformancing;
    expect(callback).toBeCalledTimes(1);

    flushMock.mockClear();
    callback.mockClear();
    donePerformancing = new Promise<void>((r) => {
      resolve = r;
    });

    root.batch(() => {
      renderPipelineWithPerformance.draw(7);
      expect(flushMock).toBeCalledTimes(0);
      computePipeline.dispatchWorkgroups(7);
      expect(flushMock).toBeCalledTimes(0);
      renderPipelineWithTimestampWrites.draw(7);
      expect(flushMock).toBeCalledTimes(0);
      expect(callback).toBeCalledTimes(0);
    });

    expect(flushMock).toBeCalledTimes(1);
    await donePerformancing;
    expect(callback).toBeCalledTimes(1);

    flushMock.mockClear();
    callback.mockClear();
    donePerformancing = new Promise<void>((r) => {
      resolve = r;
    });

    root.batch(() => {
      renderPipelineWithTimestampWrites.draw(7);
      expect(flushMock).toBeCalledTimes(0);
      computePipeline.dispatchWorkgroups(7);
      expect(flushMock).toBeCalledTimes(0);
      renderPipelineWithPerformance.draw(7);
      expect(flushMock).toBeCalledTimes(0);
      expect(callback).toBeCalledTimes(0);
    });

    expect(flushMock).toBeCalledTimes(1);
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

    const renderPipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
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
      expect(flushMock).toBeCalledTimes(0);
      renderPipeline2.drawIndexed(7);
      expect(flushMock).toBeCalledTimes(0);
      renderPipeline3.drawIndexed(7);
      expect(flushMock).toBeCalledTimes(0);
      expect(callback).toBeCalledTimes(0);
    });

    expect(flushMock).toBeCalledTimes(1);
    await donePerformancing;
    expect(callback).toBeCalledTimes(1);
  });

  it('flushes properly with beginRenderPass', ({ root }) => {
    const renderPipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline();

    const bindGroupLayout = tgpu.bindGroupLayout({});
    const bindGroup = root.createBindGroup(bindGroupLayout, {});

    const flushMock = vi.spyOn(root[$internal], 'flush');

    root['~unstable'].beginRenderPass(
      { colorAttachments: [] },
      (pass) => {
        pass.setPipeline(renderPipeline);
        pass.setBindGroup(bindGroupLayout, bindGroup);
        pass.draw(7);
      },
    );
    expect(flushMock).toBeCalledTimes(1);

    root['~unstable'].beginRenderPass(
      { colorAttachments: [] },
      (pass) => {
        pass.setPipeline(renderPipeline);
        pass.setBindGroup(bindGroupLayout, bindGroup);
        pass.draw(7);
      },
    );
    expect(flushMock).toBeCalledTimes(2);

    flushMock.mockClear();

    root['~unstable'].batch(() => {
      root['~unstable'].beginRenderPass(
        { colorAttachments: [] },
        (pass) => {
          pass.setPipeline(renderPipeline);
          pass.setBindGroup(bindGroupLayout, bindGroup);
          pass.draw(7);
        },
      );
      expect(flushMock).toBeCalledTimes(0);
      root['~unstable'].beginRenderPass(
        { colorAttachments: [] },
        (pass) => {
          pass.setPipeline(renderPipeline);
          pass.setBindGroup(bindGroupLayout, bindGroup);
          pass.draw(7);
        },
      );
      expect(flushMock).toBeCalledTimes(0);
    });
    expect(flushMock).toBeCalledTimes(1);
  });

  it('flushes immediately after read-write operation', ({ root }) => {
    const wBuffer = root.createBuffer(d.u32);
    const rBuffer = root.createBuffer(d.u32, 7);

    const flushMock = vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      wBuffer.write(1929);
      expect(flushMock).toBeCalledTimes(1);
      rBuffer.read();
      expect(flushMock).toBeCalledTimes(2);
    });
    expect(flushMock).toBeCalledTimes(3);
  });

  it('throws an error when encounters nested batch', ({ root }) => {
    const computePipeline = root
      .withCompute(entryFn)
      .createPipeline();

    root.batch(() => {
      computePipeline.dispatchWorkgroups(1);
      expect(() => {
        root.batch(() => {
          computePipeline.dispatchWorkgroups(1);
        });
      }).toThrowError('Nested batch is not allowed');
    });
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

    const renderPipeline = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
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

  it('restores auto-flush', ({ root }) => {
    const computePipeline = root.withCompute(entryFn).createPipeline();

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
