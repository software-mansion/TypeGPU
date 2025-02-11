import { describe, expect } from 'vitest';
import { u32 } from '../src/data';
import './utils/webgpuGlobals';
import {
  asMutable,
  asReadonly,
  asUniform,
} from '../src/core/buffer/bufferUsage';
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

describe('buffer.as(usage)', () => {
  it('allows creating bufferUsages only for buffers allowing them', ({
    root,
  }) => {
    root.createBuffer(u32, 2).$usage('storage').as('readonly');
    root.createBuffer(u32, 2).$usage('storage', 'uniform').as('readonly');
    root.createBuffer(u32, 2).$usage('storage', 'vertex').as('readonly');
    // @ts-expect-error
    expect(() => root.createBuffer(u32, 2).as('readonly')).toThrow();
    expect(() =>
      root
        .createBuffer(u32, 2)
        .$usage('uniform')
        // @ts-expect-error
        .as('readonly'),
    ).toThrow();

    root.createBuffer(u32, 2).$usage('uniform').as('uniform');
    root.createBuffer(u32, 2).$usage('uniform', 'storage').as('uniform');
    root.createBuffer(u32, 2).$usage('uniform', 'vertex').as('uniform');
    // @ts-expect-error
    expect(() => root.createBuffer(u32, 2).as('uniform')).toThrow();
    expect(() =>
      root
        .createBuffer(u32, 2)
        .$usage('storage')
        // @ts-expect-error
        .as('uniform'),
    ).toThrow();

    root.createBuffer(u32, 2).$usage('storage').as('mutable');
    root.createBuffer(u32, 2).$usage('storage', 'uniform').as('mutable');
    root.createBuffer(u32, 2).$usage('vertex', 'storage').as('mutable');
    // @ts-expect-error
    expect(() => root.createBuffer(u32, 2).as('mutable')).toThrow();
    expect(() =>
      root
        .createBuffer(u32, 2)
        .$usage('uniform')
        // @ts-expect-error
        .as('mutable'),
    ).toThrow();
  });
});
