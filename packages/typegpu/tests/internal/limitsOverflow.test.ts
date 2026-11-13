import { describe, expect, vi } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';
import { warnIfOverflow } from '../../src/core/pipeline/webgpuLimitations.ts';

describe('warnIfOverflow', () => {
  const limits = {
    maxUniformBuffersPerShaderStage: 2,
    maxStorageBuffersPerShaderStage: 1,
    // missing props may be added as necessary
  } as GPUSupportedLimits;

  it('does not warn when no limits are exceeded', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const layout = tgpu.bindGroupLayout({
      uniform1: { uniform: d.f32 },
      uniform2: { uniform: d.f32 },
      storage1: { storage: d.f32 },
    });

    warnIfOverflow([layout], limits);

    expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
  });

  it('counts only the buffers each stage can see', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const layout = tgpu.bindGroupLayout({
      uniform1: { uniform: d.f32, visibility: ['vertex'] },
      uniform2: { uniform: d.f32, visibility: ['vertex'] },
      uniform3: { uniform: d.f32, visibility: ['fragment'] },
      storage1: { storage: d.f32, visibility: ['vertex'] },
      storage2: { storage: d.f32, visibility: ['fragment'] },
    });

    warnIfOverflow([layout], limits);

    expect(consoleWarnSpy).toHaveBeenCalledTimes(0);
  });

  it('warns for stages the pipeline does not use', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const layout = tgpu.bindGroupLayout({
      uniform1: { uniform: d.f32, visibility: ['compute'] },
      uniform2: { uniform: d.f32, visibility: ['vertex'] },
      uniform3: { uniform: d.f32, visibility: ['vertex'] },
      uniform4: { uniform: d.f32, visibility: ['vertex'] },
    });

    warnIfOverflow([layout], limits);

    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [webgpu-limits-exceeded] ",
        "Number of uniform buffers visible to the vertex stage (3) exceeds maxUniformBuffersPerShaderStage (2). Consider:
      1. Grouping some of the uniforms into one using 'd.struct',
      2. Increasing the limit when requesting a device or creating a root.",
      ]
    `);
  });

  it('warns for uniforms', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const layout = tgpu.bindGroupLayout({
      uniform1: { uniform: d.f32 },
      uniform2: { uniform: d.f32 },
      uniform3: { uniform: d.f32 },
    });

    warnIfOverflow([layout], limits);

    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [webgpu-limits-exceeded] ",
        "Number of uniform buffers visible to the compute stage (3) exceeds maxUniformBuffersPerShaderStage (2). Consider:
      1. Grouping some of the uniforms into one using 'd.struct',
      2. Increasing the limit when requesting a device or creating a root.",
      ]
    `);
  });

  it('warns for storages', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const layout = tgpu.bindGroupLayout({
      storage1: { storage: d.f32 },
      storage2: { storage: d.f32 },
    });

    warnIfOverflow([layout], limits);

    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [webgpu-limits-exceeded] ",
        "Number of storage buffers visible to the compute stage (2) exceeds maxStorageBuffersPerShaderStage (1).",
      ]
    `);
  });

  it('warns when resources are split among layouts', () => {
    using consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const layout1 = tgpu.bindGroupLayout({
      uniform1: { uniform: d.f32 },
    });

    const layout2 = tgpu.bindGroupLayout({
      uniform2: { uniform: d.f32 },
    });

    const layout3 = tgpu.bindGroupLayout({
      uniform3: { uniform: d.f32 },
    });

    warnIfOverflow([layout1, layout2, layout3], limits);

    expect(consoleWarnSpy.mock.calls[0]).toMatchInlineSnapshot(`
      [
        "⚠️ [webgpu-limits-exceeded] ",
        "Number of uniform buffers visible to the compute stage (3) exceeds maxUniformBuffersPerShaderStage (2). Consider:
      1. Grouping some of the uniforms into one using 'd.struct',
      2. Increasing the limit when requesting a device or creating a root.",
      ]
    `);
  });
});
