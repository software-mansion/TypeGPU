import { describe, expect, it } from 'vitest';
import { asMutable, asReadonly, asUniform, asVertex, wgsl } from '../src';
import { u32 } from '../src/data';

global.GPUBufferUsage = {
  MAP_READ: 1,
  MAP_WRITE: 2,
  COPY_SRC: 4,
  COPY_DST: 8,
  INDEX: 16,
  VERTEX: 32,
  UNIFORM: 64,
  STORAGE: 128,
  INDIRECT: 256,
  QUERY_RESOLVE: 512,
};

describe('asUsage', () => {
  it('allows creating bufferUsages only for buffers allowing them', () => {
    asReadonly(wgsl.buffer(u32, 2).$allowReadonly());
    asReadonly(wgsl.buffer(u32, 2).$allowReadonly().$allowUniform());
    asReadonly(wgsl.buffer(u32, 2).$allowVertex('vertex').$allowReadonly());
    // @ts-expect-error
    expect(() => asReadonly(wgsl.buffer(u32, 2))).toThrow();
    // @ts-expect-error
    expect(() => asReadonly(wgsl.buffer(u32, 2).$allowUniform())).toThrow();

    asUniform(wgsl.buffer(u32, 2).$allowUniform());
    asUniform(wgsl.buffer(u32, 2).$allowUniform().$allowReadonly());
    asUniform(wgsl.buffer(u32, 2).$allowVertex('vertex').$allowUniform());
    // @ts-expect-error
    expect(() => asUniform(wgsl.buffer(u32, 2))).toThrow();
    // @ts-expect-error
    expect(() => asUniform(wgsl.buffer(u32, 2).$allowReadonly())).toThrow();

    asMutable(wgsl.buffer(u32, 2).$allowMutable());
    asMutable(wgsl.buffer(u32, 2).$allowMutable().$allowUniform());
    asMutable(wgsl.buffer(u32, 2).$allowVertex('vertex').$allowMutable());
    // @ts-expect-error
    expect(() => asMutable(wgsl.buffer(u32, 2))).toThrow();
    // @ts-expect-error
    expect(() => asMutable(wgsl.buffer(u32, 2).$allowUniform())).toThrow();

    asVertex(wgsl.buffer(u32, 2).$allowVertex('instance'));
    asVertex(wgsl.buffer(u32, 2).$allowVertex('instance').$allowUniform());
    asVertex(wgsl.buffer(u32, 2).$allowReadonly().$allowVertex('instance'));
    // @ts-expect-error
    expect(() => asVertex(wgsl.buffer(u32, 2))).toThrow();
    // @ts-expect-error
    expect(() => asVertex(wgsl.buffer(u32, 2).$allowMutable())).toThrow();
  });
});
