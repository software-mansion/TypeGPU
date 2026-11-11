import { describe, expect, vi } from 'vitest';
import { d, std, tgpu, type TgpuRoot } from 'typegpu';
import {
  expectRecordingOnly,
  it,
  type ModuleNamespace,
  recordCommands,
} from 'typegpu-testing-utility';
import * as sdf from '../src/index.ts';
import * as jumpFlood from '../src/jumpFlood/index.ts';

jumpFlood satisfies ModuleNamespace<
  jumpFlood.JumpFloodOptions,
  jumpFlood.JumpFloodIo,
  jumpFlood.JumpFloodDefinition,
  jumpFlood.JumpFloodInstance
>;

sdf.jumpFlood satisfies ModuleNamespace<
  jumpFlood.JumpFloodOptions,
  jumpFlood.JumpFloodIo,
  jumpFlood.JumpFloodDefinition,
  jumpFlood.JumpFloodInstance
>;

const sourceLayout = tgpu.bindGroupLayout({
  source: { texture: d.texture2d() },
});

const options: jumpFlood.JumpFloodOptions = {
  classify: (coord) => {
    'use gpu';
    return std.textureLoad(sourceLayout.$.source, coord, 0).w > 0.5;
  },
  getSdf: (_coord, size, signedDist) => {
    'use gpu';
    return signedDist / d.f32(std.min(size.x, size.y));
  },
  getColor: (_coord, _size, _signedDist, insidePx) => {
    'use gpu';
    return d.vec4f(std.textureLoad(sourceLayout.$.source, insidePx, 0).xyz, 1);
  },
};

function createSourceBindGroup(root: TgpuRoot) {
  const source = root.createTexture({ size: [512, 512], format: 'rgba8unorm' }).$usage('sampled');
  return root.createBindGroup(sourceLayout, { source: source.createView() });
}

describe('jumpFlood', () => {
  it('records the whole flood without touching the queue', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const flood = jumpFlood.defineAndInstantiate(root, options, {
      size: { width: 512, height: 512 },
      bindGroups: [createSourceBindGroup(root)],
    });

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginComputePass();
    expectRecordingOnly({ device, commandEncoder, computePassEncoder, renderPassEncoder }, () =>
      flood.step(pass),
    );
  });

  it('records into a raw compute pass', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const flood = jumpFlood.defineAndInstantiate(root, options, {
      size: { width: 512, height: 512 },
      bindGroups: [createSourceBindGroup(root)],
    });

    const pass = device.createCommandEncoder().beginComputePass();
    expectRecordingOnly({ device, commandEncoder, computePassEncoder, renderPassEncoder }, () =>
      flood.step(pass),
    );
  });

  it('dispatches seeding, one step per power of two below the size, and finalize', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const flood = jumpFlood.defineAndInstantiate(root, options, {
      size: { width: 300, height: 100 },
      bindGroups: [createSourceBindGroup(root)],
    });

    const pass = root.createCommandEncoder().beginComputePass();
    const dispatches = recordCommands(
      { device, commandEncoder, computePassEncoder, renderPassEncoder },
      () => flood.step(pass),
    ).filter((call) => call.method === 'computePass.dispatchWorkgroups');

    // 256, 128, ..., 1: 9 flood steps
    expect(dispatches).toHaveLength(1 + 9 + 1);
    for (const dispatch of dispatches) {
      expect(dispatch.args).toEqual([38, 13, undefined]);
    }
  });

  it('creates one offset uniform per step, and never writes to the queue', ({ root, device }) => {
    const flood = jumpFlood.defineAndInstantiate(root, options, {
      size: { width: 16, height: 16 },
      bindGroups: [createSourceBindGroup(root)],
    });
    device.mock.createBuffer.mockClear();
    device.mock.queue.writeBuffer.mockClear();

    const encoder = root.createCommandEncoder();
    const pass = encoder.beginComputePass();
    flood.step(pass);
    pass.end();
    encoder.submit();

    // The buffers are created lazily on first use, mapped at creation with their offset.
    const offsetBuffers = device.mock.createBuffer.mock.calls.filter(
      ([descriptor]) => descriptor.usage & GPUBufferUsage.UNIFORM,
    );
    expect(offsetBuffers).toHaveLength(4);
    expect(offsetBuffers.every(([descriptor]) => descriptor.mappedAtCreation)).toBe(true);
    expect(device.mock.queue.writeBuffer).not.toHaveBeenCalled();
  });

  it('resolves the flood step with its offset read from the step bind group', ({ root }) => {
    const definition = jumpFlood.define(root, options);
    expect(tgpu.resolve([definition.pipelines.flood])).toContain('offset');
  });

  it('can be destroyed twice, and throws when used afterwards', ({ root }) => {
    const flood = jumpFlood.defineAndInstantiate(root, options, {
      size: { width: 64, height: 64 },
    });
    const sdfDestroy = vi.spyOn(flood.sdfOutput, 'destroy');

    flood.destroy();
    flood[Symbol.dispose]();
    expect(sdfDestroy).toHaveBeenCalledTimes(1);

    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => flood.step(pass)).toThrowErrorMatchingInlineSnapshot(
      `[Error: jumpFlood: called 'step' on a destroyed instance]`,
    );
    expect(() => flood.initSync()).toThrow(/jumpFlood/);
  });

  it('leaves borrowed outputs alive', ({ root }) => {
    const sdfOutput = root
      .createTexture({ size: [64, 64], format: 'rgba16float' })
      .$usage('storage', 'sampled');
    const colorOutput = root
      .createTexture({ size: [64, 64], format: 'rgba8unorm' })
      .$usage('storage', 'sampled');
    const sdfDestroy = vi.spyOn(sdfOutput, 'destroy');
    const colorDestroy = vi.spyOn(colorOutput, 'destroy');

    const flood = jumpFlood.defineAndInstantiate(root, options, {
      size: { width: 64, height: 64 },
      sdfOutput,
      colorOutput,
    });
    expect(flood.sdfOutput).toBe(sdfOutput);
    flood.destroy();

    expect(sdfDestroy).not.toHaveBeenCalled();
    expect(colorDestroy).not.toHaveBeenCalled();
  });

  it('rejects outputs of the wrong size', ({ root }) => {
    const sdfOutput = root
      .createTexture({ size: [32, 64], format: 'rgba16float' })
      .$usage('storage', 'sampled');

    expect(() =>
      jumpFlood.defineAndInstantiate(root, options, {
        size: { width: 64, height: 64 },
        sdfOutput,
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: jumpFlood: 'sdfOutput' is 32x64, expected 64x64]`,
    );
  });
});

describe('createJumpFlood (deprecated)', () => {
  it('runs the flood in one submit', ({ root, device }) => {
    const runner = sdf
      .createJumpFlood({ root, size: { width: 64, height: 64 }, ...options })
      .with(createSourceBindGroup(root));

    device.mock.queue.submit.mockClear();
    device.mock.queue.writeBuffer.mockClear();
    runner.run();

    expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);
    expect(device.mock.queue.writeBuffer).not.toHaveBeenCalled();
    runner.destroy();
  });
});
