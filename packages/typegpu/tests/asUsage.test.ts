import { describe, expect, it } from 'vitest';
import { u32 } from '../src/data';
import tgpu, { asMutable, asReadonly, asUniform } from '../src/experimental';
import './utils/webgpuGlobals';

describe('asUsage', () => {
  it('allows creating bufferUsages only for buffers allowing them', () => {
    asReadonly(tgpu.createBuffer(u32, 2).$usage('storage'));
    asReadonly(tgpu.createBuffer(u32, 2).$usage('storage', 'uniform'));
    asReadonly(tgpu.createBuffer(u32, 2).$usage('storage', 'vertex'));
    // @ts-expect-error
    expect(() => asReadonly(tgpu.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asReadonly(tgpu.createBuffer(u32, 2).$usage('uniform')),
    ).toThrow();

    asUniform(tgpu.createBuffer(u32, 2).$usage('uniform'));
    asUniform(tgpu.createBuffer(u32, 2).$usage('uniform', 'storage'));
    asUniform(tgpu.createBuffer(u32, 2).$usage('uniform', 'vertex'));
    // @ts-expect-error
    expect(() => asUniform(tgpu.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asUniform(tgpu.createBuffer(u32, 2).$usage('storage')),
    ).toThrow();

    asMutable(tgpu.createBuffer(u32, 2).$usage('storage'));
    asMutable(tgpu.createBuffer(u32, 2).$usage('storage', 'uniform'));
    asMutable(tgpu.createBuffer(u32, 2).$usage('vertex', 'storage'));
    // @ts-expect-error
    expect(() => asMutable(tgpu.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asMutable(tgpu.createBuffer(u32, 2).$usage('uniform')),
    ).toThrow();
  });
});
