import { d, std, tgpu } from 'typegpu';
import { describe, expect, vi } from 'vitest';
import { expectRecordingOnly, it, type ModuleNamespace } from 'typegpu-testing-utility';
import * as hrc from '../src/holographic/index.ts';

hrc satisfies ModuleNamespace<
  hrc.HolographicOptions,
  hrc.HolographicIo,
  hrc.HolographicDefinition,
  hrc.HolographicInstance
>;

const medium = (pixel: d.v2u) => {
  'use gpu';
  const inside = std.length(d.vec2f(pixel) - 16) < 4;
  return { emission: std.select(d.vec3f(), d.vec3f(4), inside), extinction: 0.5 };
};

const io = { size: { width: 32, height: 24 } };

describe('holographic module', () => {
  it('only records', ({ root, device, commandEncoder, computePassEncoder, renderPassEncoder }) => {
    const instance = hrc.defineAndInstantiate(root, { medium }, io);
    const pass = root.createCommandEncoder().beginComputePass();

    expectRecordingOnly({ device, commandEncoder, computePassEncoder, renderPassEncoder }, () =>
      instance.step(pass),
    );
  });

  it('only records with rgb transmission and a source', ({
    root,
    device,
    commandEncoder,
    computePassEncoder,
    renderPassEncoder,
  }) => {
    const instance = hrc.defineAndInstantiate(
      root,
      {
        transmission: 'rgb',
        medium: (pixel) => {
          'use gpu';
          return { emission: d.vec3f(d.f32(pixel.x) / 32), extinction: d.vec3f(0.1, 0.2, 0.3) };
        },
        source: (_pixel, incident) => {
          'use gpu';
          return incident * 0.5;
        },
        tracedLevels: 2,
      },
      { ...io, iterations: 3 },
    );
    const pass = root.createCommandEncoder().beginComputePass();

    expectRecordingOnly({ device, commandEncoder, computePassEncoder, renderPassEncoder }, () =>
      instance.step(pass),
    );
  });

  it('records every iteration', ({ root, computePassEncoder }) => {
    const instance = hrc.defineAndInstantiate(root, { medium }, io);
    const pass = root.createCommandEncoder().beginComputePass();
    const count = () => computePassEncoder.mock.dispatchWorkgroups.mock.calls.length;

    let before = count();
    instance.step(pass);
    const once = count() - before;

    instance.iterations = 2;
    before = count();
    instance.step(pass);
    expect(count() - before).toBe(once * 2);
    expect(() => {
      instance.iterations = 0;
    }).toThrow();
  });

  it('serves every size with one definition', ({ root, device }) => {
    const definition = hrc.define(root, { medium });
    const pass = root.createCommandEncoder().beginComputePass();
    hrc.instantiate(root, definition, io).step(pass);
    hrc.instantiate(root, definition, { size: { width: 64, height: 64 } }).step(pass);

    // Extending (traced and merged), gathering (inner and final) and integrating
    expect(device.mock.createComputePipeline).toHaveBeenCalledTimes(5);
  });

  it('binds bind groups from io', ({ root, computePassEncoder }) => {
    const layout = tgpu.bindGroupLayout({ intensity: { uniform: d.f32 } });
    const intensity = root.createUniform(d.f32, 2);
    const instance = hrc.defineAndInstantiate(
      root,
      {
        medium: () => {
          'use gpu';
          return { emission: d.vec3f(layout.$.intensity), extinction: 0 };
        },
      },
      { ...io, bindGroups: [root.createBindGroup(layout, { intensity })] },
    );
    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => instance.step(pass)).not.toThrow();
    expect(computePassEncoder.mock.setBindGroup).toHaveBeenCalled();
  });

  it('destroys only what it created, once', ({ root }) => {
    const output = root
      .createTexture({ size: [32, 24], format: 'rgba16float' })
      .$usage('storage', 'sampled');
    const borrowedDestroy = vi.spyOn(output, 'destroy');
    const instance = hrc.defineAndInstantiate(root, { medium }, { ...io, output });
    const sectorsDestroy = vi.spyOn(instance.sectors, 'destroy');

    instance.destroy();
    instance[Symbol.dispose]();

    expect(borrowedDestroy).not.toHaveBeenCalled();
    expect(sectorsDestroy).toHaveBeenCalledTimes(1);
    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => instance.step(pass)).toThrow(/holographic/);
  });

  it('rejects mismatched textures', ({ root }) => {
    const output = root
      .createTexture({ size: [16, 16], format: 'rgba16float' })
      .$usage('storage', 'sampled');
    expect(() => hrc.defineAndInstantiate(root, { medium }, { ...io, output })).toThrow(/output/);
  });

  it('keeps the deprecated runner working', ({ root, device }) => {
    const runner = hrc.create({ root, medium, ...io });
    runner.run({ iterations: 2 });
    expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);
    runner.destroy();
  });
});
