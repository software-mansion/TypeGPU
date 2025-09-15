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
    const renderPipeline1 = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      });

    const renderPipeline2 = root
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
      renderPipeline1.draw(7);
      computePipeline.dispatchWorkgroups(7);
      renderPipeline2.draw(7);
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

    const renderPipelineWithPerformance = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      })
      .withPerformanceCallback(callback);

    const renderPipelineWithTimestampWrites = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      })
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

    const renderPipeline1 = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      })
      .withIndexBuffer(indexBuffer);

    const renderPipeline2 = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      })
      .withPerformanceCallback(callback)
      .withIndexBuffer(indexBuffer);

    const renderPipeline3 = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline()
      .withColorAttachment({
        view: {} as unknown as GPUTextureView,
        loadOp: 'clear',
        storeOp: 'store',
      })
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

  it('flushes properly when used with beginRenderPass', ({ root }) => {
    const renderPipeline1 = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline();

    const bindGroupLayout = tgpu.bindGroupLayout({});
    const bindGroup = root.createBindGroup(bindGroupLayout, {});

    const flushMock = vi.spyOn(root[$internal], 'flush');

    root['~unstable'].beginRenderPass(
      { colorAttachments: [] },
      (pass) => {
        pass.setPipeline(renderPipeline1);
        pass.setBindGroup(bindGroupLayout, bindGroup);
        pass.draw(7);
      },
    );
    expect(flushMock).toBeCalledTimes(1);
    root['~unstable'].beginRenderPass(
      { colorAttachments: [] },
      (pass) => {
        pass.setPipeline(renderPipeline1);
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
          pass.setPipeline(renderPipeline1);
          pass.setBindGroup(bindGroupLayout, bindGroup);
          pass.draw(7);
        },
      );
      expect(flushMock).toBeCalledTimes(0);
      root['~unstable'].beginRenderPass(
        { colorAttachments: [] },
        (pass) => {
          pass.setPipeline(renderPipeline1);
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

  it('handles nesting itself with flushNestedBatch flag set to false', ({ root }) => {
    const computePipeline = root
      .withCompute(entryFn)
      .createPipeline();

    const flushMock = vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      root.batch(() => {
        computePipeline.dispatchWorkgroups(1);
      });
      expect(flushMock).toBeCalledTimes(0);

      root.batch(() => {
        computePipeline.dispatchWorkgroups(1);
      });
      expect(flushMock).toBeCalledTimes(0);

      root.batch(() => {
        computePipeline.dispatchWorkgroups(1);
      });
      expect(flushMock).toBeCalledTimes(0);
    });
    expect(flushMock).toBeCalledTimes(1);
  });
});
