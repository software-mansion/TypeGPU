import { d, std } from 'typegpu';
import { it } from 'typegpu-testing-utility';
import { describe, expect, vi } from 'vitest';
import { createPrefixScanComputer, prefixScan } from '../src/index.ts';
import { getConversionWarnings, getResolvedWgsl } from './utils.ts';

describe('prefix scan', () => {
  it('generates type-matched kernels without conversion warnings', ({ root, device }) => {
    const warnSpy = vi.spyOn(console, 'warn');

    for (const dataType of [d.u32, d.i32] as const) {
      const buffer = root.createBuffer(d.arrayOf(dataType, 4096)).$usage('storage');
      prefixScan(root, { inputBuffer: buffer, operation: std.add, identityElement: 0, dataType });
    }
    const f32Buffer = root.createBuffer(d.arrayOf(d.f32, 4096)).$usage('storage');
    prefixScan(root, { inputBuffer: f32Buffer, operation: std.add, identityElement: 0 });

    const wgsl = getResolvedWgsl(device);
    expect(wgsl).toContain('array<u32>');
    expect(wgsl).toContain('array<i32>');
    expect(wgsl).toContain('array<f32>');

    expect(getConversionWarnings(warnSpy)).toEqual([]);
    warnSpy.mockRestore();
  });

  it('reuses scratch buffers and bind groups across repeated computes', ({ root, device }) => {
    const computer = createPrefixScanComputer(root, {
      operation: std.add,
      identityElement: 0,
      dataType: d.u32,
    });
    const buffer = root.createBuffer(d.arrayOf(d.u32, 4096)).$usage('storage');

    computer.compute(buffer, false);
    const buffersAfterFirst = device.mock.createBuffer.mock.calls.length;
    const bindGroupsAfterFirst = device.mock.createBindGroup.mock.calls.length;
    const modulesAfterFirst = device.mock.createShaderModule.mock.calls.length;

    computer.compute(buffer, false);
    computer.compute(buffer, false);

    expect(device.mock.createBuffer.mock.calls.length).toBe(buffersAfterFirst);
    expect(device.mock.createBindGroup.mock.calls.length).toBe(bindGroupsAfterFirst);
    expect(device.mock.createShaderModule.mock.calls.length).toBe(modulesAfterFirst);
  });

  it('throws when combining querySet with an external pass', ({ root }) => {
    const computer = createPrefixScanComputer(root, {
      operation: std.add,
      identityElement: 0,
    });
    const buffer = root.createBuffer(d.arrayOf(d.f32, 64)).$usage('storage');
    const plan = computer.prepare(buffer);

    const externalPass = {
      __brand: 'GPUComputePassEncoder',
    } as unknown as GPUComputePassEncoder;
    const querySet = root.createQuerySet('timestamp', 2);

    expect(() => plan.run({ pass: externalPass, querySet })).toThrowError(
      /cannot be used when recording/,
    );
  });
});
