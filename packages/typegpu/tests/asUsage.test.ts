import { describe, expect } from 'vitest';
import { u32 } from '../src/data';
import { asMutable, asReadonly, asUniform } from '../src/experimental';
import './utils/webgpuGlobals';
import { it } from './utils/extendedIt';

describe('asUsage', () => {
  it('allows creating bufferUsages only for buffers allowing them', ({
    root,
  }) => {
    asReadonly(root.createBuffer(u32, 2).$usage('storage'));
    asReadonly(root.createBuffer(u32, 2).$usage('storage', 'uniform'));
    asReadonly(root.createBuffer(u32, 2).$usage('storage', 'vertex'));
    // @ts-expect-error
    expect(() => asReadonly(root.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asReadonly(root.createBuffer(u32, 2).$usage('uniform')),
    ).toThrow();

    asUniform(root.createBuffer(u32, 2).$usage('uniform'));
    asUniform(root.createBuffer(u32, 2).$usage('uniform', 'storage'));
    asUniform(root.createBuffer(u32, 2).$usage('uniform', 'vertex'));
    // @ts-expect-error
    expect(() => asUniform(root.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asUniform(root.createBuffer(u32, 2).$usage('storage')),
    ).toThrow();

    asMutable(root.createBuffer(u32, 2).$usage('storage'));
    asMutable(root.createBuffer(u32, 2).$usage('storage', 'uniform'));
    asMutable(root.createBuffer(u32, 2).$usage('vertex', 'storage'));
    // @ts-expect-error
    expect(() => asMutable(root.createBuffer(u32, 2))).toThrow();
    expect(() =>
      // @ts-expect-error
      asMutable(root.createBuffer(u32, 2).$usage('uniform')),
    ).toThrow();
  });
});
