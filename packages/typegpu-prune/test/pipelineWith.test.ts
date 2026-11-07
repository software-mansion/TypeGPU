import { describe, expect, it } from 'vitest';
import type { ComputePipelineArtifact, RenderPipelineArtifact } from '../src/artifact.ts';
import {
  type PipelineHost,
  PrunedComputePipeline,
  PrunedGuardedComputePipeline,
  PrunedRenderPipeline,
} from '../src/runtime/pipelines.ts';
import { PrunedBuffer, PrunedRoot } from '../src/runtime/root.ts';

const computePass = { dispatchWorkgroups() {}, setPipeline() {}, setBindGroup() {}, end() {} };
const renderPass = { draw() {}, setPipeline() {}, setBindGroup() {}, end() {} };

function setup(createAsync: () => Promise<unknown> = async () => ({})) {
  const counts = { sync: 0, async: 0 };
  const device = {
    createPipelineLayout: () => ({}),
    createBindGroupLayout: () => ({}),
    createComputePipeline: () => {
      counts.sync++;
      return {};
    },
    createRenderPipeline: () => {
      counts.sync++;
      return {};
    },
    createComputePipelineAsync: () => {
      counts.async++;
      return createAsync();
    },
    createRenderPipelineAsync: () => {
      counts.async++;
      return createAsync();
    },
    createCommandEncoder: () => ({ beginComputePass: () => computePass, finish: () => ({}) }),
    queue: { submit() {}, writeBuffer() {} },
  } as unknown as GPUDevice;
  const root = new PrunedRoot(device, false);
  const host: PipelineHost = {
    root,
    shaderModule: () => ({}) as GPUShaderModule,
    layoutObject: () => {
      throw new Error('unused');
    },
    bindGroup: () => {
      throw new Error('unused');
    },
    buffer: () => {
      throw new Error('unused');
    },
    vertexLayout: () => {
      throw new Error('unused');
    },
  };
  const computeArt: ComputePipelineArtifact = { shader: 0, groups: [] };
  const renderArt: RenderPipelineArtifact = {
    shader: 0,
    groups: [],
    vertexSlots: [],
    vertexBuffers: [],
    descriptor: { vertex: {} },
  };
  const compute = new PrunedComputePipeline(host, computeArt);
  const render = new PrunedRenderPipeline(host, renderArt);
  const sizeBuffer = new PrunedBuffer(root, { size: 12, align: 16 });
  const guarded = new PrunedGuardedComputePipeline(compute, sizeBuffer, [64, 1, 1]);
  return { root, compute, render, guarded, counts };
}

describe('.with()', () => {
  it('rejects passes and encoders on guarded pipelines, as in TypeGPU', () => {
    const { root, guarded } = setup();
    const message = /Guarded pipelines only accept bind groups/;
    expect(() => guarded.with(computePass as never)).toThrow(message);
    expect(() => guarded.with(root.createCommandEncoder() as never)).toThrow(message);
  });

  it('rejects a pass of the wrong kind, as in TypeGPU', () => {
    const { compute, render } = setup();
    expect(() => compute.with(renderPass as never)).toThrow(
      'Unsupported value passed into .with()',
    );
    expect(() => render.with(computePass as never)).toThrow(
      'Unsupported value passed into .with()',
    );
    expect(() => compute.with(render as never)).toThrow('Unsupported value passed into .with()');
  });

  it('records into an encoder from root.createCommandEncoder()', () => {
    const { root, compute } = setup();
    expect(() => compute.with(root.createCommandEncoder()).dispatchWorkgroups(1)).not.toThrow();
  });
});

describe('initAsync()', () => {
  it('refuses to create the pipeline synchronously while pending, as in TypeGPU', async () => {
    const { compute, render, counts } = setup();
    const pending = [compute.initAsync(), render.initAsync()];
    const message = "'pipeline.initAsync()' was called and is not yet resolved.";
    expect(() => compute.dispatchWorkgroups(1)).toThrow(message);
    expect(() => render.initSync()).toThrow(message);
    await Promise.all(pending);
    expect(() => compute.dispatchWorkgroups(1)).not.toThrow();
    expect(counts).toStrictEqual({ sync: 0, async: 2 });
  });

  it('retries a failed creation, as in TypeGPU', async () => {
    let attempt = 0;
    const { compute, render, counts } = setup(async () => {
      if (attempt++ < 2) {
        throw new Error('creation failed');
      }
      return {};
    });
    await expect(compute.initAsync()).rejects.toThrow('creation failed');
    await expect(render.initAsync()).rejects.toThrow('creation failed');
    await expect(compute.initAsync()).resolves.toBeUndefined();
    await expect(render.initAsync()).resolves.toBeUndefined();
    expect(counts).toStrictEqual({ sync: 0, async: 4 });
  });
});
