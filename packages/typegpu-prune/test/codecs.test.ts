import { describe, expect, it } from 'vitest';
import type { Codec } from '../src/artifact.ts';
import { buildFixture } from './utils/build.ts';

describe('precompiled codecs', async () => {
  const bundle = await buildFixture('codecs.ts', { precompile: true });
  const { schemas } = (await import(bundle.path)) as {
    schemas: (root: object) => { Particle: Codec; count: number; name: string };
  };
  const result = schemas({ device: {} });

  it('drops TypeGPU from the bundle', () => {
    expect(bundle.code).not.toContain('typegpu/src');
    expect(bundle.code).toContain('__tgpuPruneAttach');
  });

  it('keeps plain data as-is', () => {
    expect(result.count).toBe(3);
    expect(result.name).toBe('particles');
  });

  it('computes the memory layout at build time', () => {
    expect(result.Particle.size).toBe(96);
    expect(result.Particle.align).toBe(16);
  });

  it('round-trips values through the generated writer and reader', () => {
    const value = {
      position: [1, 2, 3],
      mass: 4,
      ids: [5, 6, 7],
      transform: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      flags: [-1, 2],
    };
    const view = new DataView(new ArrayBuffer(result.Particle.size));
    result.Particle.write?.(view, 0, value);

    expect(view.getFloat32(12, true)).toBe(4); // mass right after the vec3f
    expect(view.getUint32(16, true)).toBe(5); // ids at offset 16
    expect(view.getFloat32(32 + 16, true)).toBe(4); // second column of the mat3x3f is padded to 16 bytes
    expect(view.getInt32(80, true)).toBe(-1); // flags after the 48 byte matrix
    expect(result.Particle.read?.(view, 0)).toStrictEqual(value);
  });
});
