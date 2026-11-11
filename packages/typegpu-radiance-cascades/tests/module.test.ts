import { d, tgpu, std } from 'typegpu';
import { describe, expect, vi } from 'vitest';
import { expectRecordingOnly, it, type ModuleNamespace } from 'typegpu-testing-utility';
import * as rc from '../src/index.ts';

rc satisfies ModuleNamespace<
  rc.RadianceCascadesOptions,
  rc.RadianceCascadesIo,
  rc.RadianceCascadesDefinition,
  rc.RadianceCascadesInstance
>;

const options: rc.RadianceCascadesOptions = {
  sdf: (uv) => {
    'use gpu';
    return std.length(uv - 0.5) - 0.1;
  },
  emission: () => {
    'use gpu';
    return d.vec3f(1);
  },
};

const io = { size: { width: 64, height: 32 }, sdfResolution: { width: 64, height: 32 } };

describe('radiance cascades module', () => {
  it('only records', ({ root, device, commandEncoder, computePassEncoder, renderPassEncoder }) => {
    const instance = rc.defineAndInstantiate(root, options, io);
    const pass = root.createCommandEncoder().beginComputePass();

    expectRecordingOnly({ device, commandEncoder, computePassEncoder, renderPassEncoder }, () =>
      instance.step(pass),
    );
  });

  it('records one dispatch per cascade and one for the radiance field', ({
    root,
    computePassEncoder,
  }) => {
    const instance = rc.defineAndInstantiate(root, options, io);
    const pass = root.createCommandEncoder().beginComputePass();
    const before = computePassEncoder.mock.dispatchWorkgroups.mock.calls.length;

    instance.step(pass);

    const dispatches = computePassEncoder.mock.dispatchWorkgroups.mock.calls.slice(before);
    expect(dispatches.length).toBeGreaterThan(5);
    // The radiance field covers the 64×32 output
    expect(dispatches.at(-1)).toEqual([8, 4, undefined]);
    expect(computePassEncoder.mock.end).not.toHaveBeenCalled();
  });

  it('serves every size with one definition', ({ root, device }) => {
    const definition = rc.define(root, options);
    const a = rc.instantiate(root, definition, io);
    const b = rc.instantiate(root, definition, {
      size: { width: 128, height: 128 },
      sdfResolution: { width: 128, height: 128 },
    });
    const pass = root.createCommandEncoder().beginComputePass();
    a.step(pass);
    b.step(pass);

    expect(device.mock.createComputePipeline).toHaveBeenCalledTimes(3);
  });

  it('binds bind groups from io', ({ root, computePassEncoder }) => {
    const layout = tgpu.bindGroupLayout({ intensity: { uniform: d.f32 } });
    const intensity = root.createUniform(d.f32, 2);
    const instance = rc.defineAndInstantiate(
      root,
      {
        ...options,
        emission: () => {
          'use gpu';
          return d.vec3f(layout.$.intensity);
        },
      },
      { ...io, bindGroups: [root.createBindGroup(layout, { intensity })] },
    );
    const pass = root.createCommandEncoder().beginComputePass();
    const before = computePassEncoder.mock.setBindGroup.mock.calls.length;

    instance.step(pass);

    expect(computePassEncoder.mock.setBindGroup.mock.calls.length).toBeGreaterThan(before);
  });

  it('destroys only what it created, once', ({ root }) => {
    const output = root
      .createTexture({ size: [64, 32], format: 'rgba16float' })
      .$usage('storage', 'sampled');
    const borrowedDestroy = vi.spyOn(output, 'destroy');
    const instance = rc.defineAndInstantiate(root, options, { ...io, size: undefined, output });
    expect(instance.output).toBe(output);

    instance.destroy();
    instance[Symbol.dispose]();

    expect(borrowedDestroy).not.toHaveBeenCalled();
    const pass = root.createCommandEncoder().beginComputePass();
    expect(() => instance.step(pass)).toThrow(/radiance-cascades/);
    expect(() => instance.initSync()).toThrow(/radiance-cascades/);
  });

  it('destroys its own output', ({ root }) => {
    const instance = rc.defineAndInstantiate(root, options, io);
    const ownDestroy = vi.spyOn(instance.output, 'destroy');

    instance.destroy();
    instance.destroy();

    expect(ownDestroy).toHaveBeenCalledTimes(1);
  });

  it('keeps the deprecated runner working', ({ root, device }) => {
    const runner = rc.create({ root, ...options, ...io });
    runner.run();
    expect(device.mock.queue.submit).toHaveBeenCalledTimes(1);
    runner.destroy();
  });
});
