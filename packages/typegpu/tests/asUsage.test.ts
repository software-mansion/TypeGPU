import { describe, expect, it } from 'vitest';
import { u32 } from '../src/data';
import tgpu, {
  asMutable,
  asReadonly,
  asUniform,
  asVertex,
} from '../src/experimental';
import './utils/webgpuGlobals';

describe('asUsage', () => {
  it('allows creating bufferUsages only for buffers allowing them', () => {
    asReadonly(tgpu.createBuffer(u32, 2).$usage(tgpu.Storage));
    asReadonly(tgpu.createBuffer(u32, 2).$usage(tgpu.Storage, tgpu.Uniform));
    asReadonly(tgpu.createBuffer(u32, 2).$usage(tgpu.Storage, tgpu.Vertex));
    // @ts-expect-error
    expect(() => asReadonly(tgpu.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asReadonly(tgpu.createBuffer(u32, 2).$usage(tgpu.Uniform)),
    ).toThrow();

    asUniform(tgpu.createBuffer(u32, 2).$usage(tgpu.Uniform));
    asUniform(tgpu.createBuffer(u32, 2).$usage(tgpu.Uniform, tgpu.Storage));
    asUniform(tgpu.createBuffer(u32, 2).$usage(tgpu.Uniform, tgpu.Vertex));
    // @ts-expect-error
    expect(() => asUniform(tgpu.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asUniform(tgpu.createBuffer(u32, 2).$usage(tgpu.Storage)),
    ).toThrow();

    asMutable(tgpu.createBuffer(u32, 2).$usage(tgpu.Storage));
    asMutable(tgpu.createBuffer(u32, 2).$usage(tgpu.Storage, tgpu.Uniform));
    asMutable(tgpu.createBuffer(u32, 2).$usage(tgpu.Vertex, tgpu.Storage));
    // @ts-expect-error
    expect(() => asMutable(tgpu.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asMutable(tgpu.createBuffer(u32, 2).$usage(tgpu.Uniform)),
    ).toThrow();

    asVertex(tgpu.createBuffer(u32, 2).$usage(tgpu.Vertex), 'vertex');
    asVertex(
      tgpu.createBuffer(u32, 2).$usage(tgpu.Vertex, tgpu.Uniform),
      'instance',
    );
    asVertex(
      tgpu.createBuffer(u32, 2).$usage(tgpu.Storage, tgpu.Vertex),
      'instance',
    );
    // @ts-expect-error
    expect(() => asVertex(tgpu.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asVertex(tgpu.createBuffer(u32, 2).$usage(tgpu.Storage)),
    ).toThrow();
  });
});
