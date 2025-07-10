import { describe, expect, expectTypeOf } from 'vitest';
import * as d from '../src/data/index.ts';
import { it } from './utils/extendedIt.ts';
import type {
  StorageFlag,
  TgpuBuffer,
  TgpuMutable,
  TgpuReadonly,
  TgpuUniform,
  UniformFlag,
} from '../src/index.ts';

describe('root.createMutable', () => {
  it('creates a mutable', ({ root }) => {
    const foo = root.createMutable(d.f32);

    // Ensuring that the underlying buffer is created
    root.unwrap(foo.buffer);

    expectTypeOf(foo).toEqualTypeOf<TgpuMutable<d.F32>>();
    expect(root.device.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('creates a mutable with initial value', async ({ root }) => {
    const foo = root.createMutable(d.f32, 123);
    expectTypeOf(foo).toEqualTypeOf<TgpuMutable<d.F32>>();
  });

  it('creates a mutable with a properly typed buffer', async ({ root }) => {
    const foo = root.createMutable(d.f32, 123);
    expectTypeOf(foo.buffer).toEqualTypeOf<TgpuBuffer<d.F32> & StorageFlag>();
  });
});

describe('root.createReadonly', () => {
  it('creates a readonly', ({ root }) => {
    const foo = root.createReadonly(d.f32);

    // Ensuring that the underlying buffer is created
    root.unwrap(foo.buffer);

    expectTypeOf(foo).toEqualTypeOf<TgpuReadonly<d.F32>>();
    expect(root.device.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('creates a readonly with initial value', async ({ root }) => {
    const foo = root.createReadonly(d.f32, 123);
    expectTypeOf(foo).toEqualTypeOf<TgpuReadonly<d.F32>>();
  });

  it('creates a readonly with a properly typed buffer', async ({ root }) => {
    const foo = root.createReadonly(d.f32, 123);
    expectTypeOf(foo.buffer).toEqualTypeOf<TgpuBuffer<d.F32> & StorageFlag>();
  });
});

describe('root.createUniform', () => {
  it('creates a uniform', ({ root }) => {
    const foo = root.createUniform(d.f32);

    // Ensuring that the underlying buffer is created
    root.unwrap(foo.buffer);

    expectTypeOf(foo).toEqualTypeOf<TgpuUniform<d.F32>>();
    expect(root.device.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('creates a uniform with initial value', async ({ root }) => {
    const foo = root.createUniform(d.f32, 123);
    expectTypeOf(foo).toEqualTypeOf<TgpuUniform<d.F32>>();
  });

  it('creates a uniform with a properly typed buffer', async ({ root }) => {
    const foo = root.createUniform(d.f32, 123);
    expectTypeOf(foo.buffer).toEqualTypeOf<TgpuBuffer<d.F32> & UniformFlag>();
  });
});
