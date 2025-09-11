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

    vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      renderPipeline1.draw(7);
      computePipeline.dispatchWorkgroups(7);
      renderPipeline2.draw(7);
      expect(root[$internal].flush).toBeCalledTimes(0);
    });

    expect(root[$internal].flush).toBeCalledTimes(1);
  });

  it('flushes immediatelly when used with performance callback', ({ root }) => {
    const querySet = root.createQuerySet('timestamp', 2);
    const callback = vi.fn();

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

    vi.spyOn(root[$internal], 'flush');

    // trying different permutations
    root.batch(() => {
      computePipeline.dispatchWorkgroups(7);
      expect(root[$internal].flush).toBeCalledTimes(0);
      renderPipelineWithPerformance.draw(7);
      expect(root[$internal].flush).toBeCalledTimes(1);
      renderPipelineWithTimestampWrites.draw(7);
      expect(root[$internal].flush).toBeCalledTimes(1);
    });
    expect(root[$internal].flush).toBeCalledTimes(2);

    vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      renderPipelineWithPerformance.draw(7);
      expect(root[$internal].flush).toBeCalledTimes(1);
      computePipeline.dispatchWorkgroups(7);
      expect(root[$internal].flush).toBeCalledTimes(1);
      renderPipelineWithTimestampWrites.draw(7);
      expect(root[$internal].flush).toBeCalledTimes(1);
    });
    expect(root[$internal].flush).toBeCalledTimes(2);

    vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      renderPipelineWithTimestampWrites.draw(7);
      expect(root[$internal].flush).toBeCalledTimes(0);
      computePipeline.dispatchWorkgroups(7);
      expect(root[$internal].flush).toBeCalledTimes(0);
      renderPipelineWithPerformance.draw(7);
      expect(root[$internal].flush).toBeCalledTimes(1);
    });
    expect(root[$internal].flush).toBeCalledTimes(2);
  });

  it('flushes properly with drawIndexed', ({ root }) => {
    const callback = vi.fn();
    const querySet = root.createQuerySet('timestamp', 2);
    const indexBuffer = root.createBuffer(d.arrayOf(d.u16, 2)).$usage('index');

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

    vi.spyOn(root[$internal], 'flush');

    root.batch(() => {
      renderPipeline1.drawIndexed(7);
      expect(root[$internal].flush).toBeCalledTimes(0);
      renderPipeline2.drawIndexed(7);
      expect(root[$internal].flush).toBeCalledTimes(1);
      renderPipeline3.drawIndexed(7);
      expect(root[$internal].flush).toBeCalledTimes(1);
    });

    expect(root[$internal].flush).toBeCalledTimes(2);
  });

  it('flushes properly when used with beginRenderPass', ({ root }) => {
    const renderPipeline1 = root
      .withVertex(vertexFn, {})
      .withFragment(fragmentFn, { format: 'rgba8unorm' })
      .createPipeline();

    const bindGroupLayout = tgpu.bindGroupLayout({});
    const bindGroup = root.createBindGroup(bindGroupLayout, {});

    vi.spyOn(root[$internal], 'flush');

    root['~unstable'].beginRenderPass(
      { colorAttachments: [] },
      (pass) => {
        pass.setPipeline(renderPipeline1);
        pass.setBindGroup(bindGroupLayout, bindGroup);
        pass.draw(7);
      },
    );
    expect(root[$internal].flush).toBeCalledTimes(1);
    root['~unstable'].beginRenderPass(
      { colorAttachments: [] },
      (pass) => {
        pass.setPipeline(renderPipeline1);
        pass.setBindGroup(bindGroupLayout, bindGroup);
        pass.draw(7);
      },
    );
    expect(root[$internal].flush).toBeCalledTimes(2);

    vi.spyOn(root[$internal], 'flush');

    root['~unstable'].batch(() => {
      root['~unstable'].beginRenderPass(
        { colorAttachments: [] },
        (pass) => {
          pass.setPipeline(renderPipeline1);
          pass.setBindGroup(bindGroupLayout, bindGroup);
          pass.draw(7);
        },
      );
      expect(root[$internal].flush).toBeCalledTimes(0);
      root['~unstable'].beginRenderPass(
        { colorAttachments: [] },
        (pass) => {
          pass.setPipeline(renderPipeline1);
          pass.setBindGroup(bindGroupLayout, bindGroup);
          pass.draw(7);
        },
      );
      expect(root[$internal].flush).toBeCalledTimes(0);
    });
    expect(root[$internal].flush).toBeCalledTimes(1);
  });
});
