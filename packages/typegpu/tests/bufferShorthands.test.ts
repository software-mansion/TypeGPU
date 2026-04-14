import { describe, expect, expectTypeOf } from 'vitest';
import * as d from '../src/data/index.ts';
import { it } from 'typegpu-testing-utility';
import type {
  StorageFlag,
  TgpuBuffer,
  TgpuMutable,
  TgpuReadonly,
  TgpuUniform,
  UniformFlag,
} from '../src/index.js';
import { attest } from '@ark/attest';

describe('root.createMutable', () => {
  it('creates a mutable', ({ root }) => {
    const foo = root.createMutable(d.f32);

    // Ensuring that the underlying buffer is created
    root.unwrap(foo.buffer);

    expectTypeOf(foo).toEqualTypeOf<TgpuMutable<d.F32>>();
    expect(root.device.createBuffer).toHaveBeenCalledTimes(1);
  });

  it('creates a mutable with initial value', ({ root }) => {
    const foo = root.createMutable(d.f32, 123);
    expectTypeOf(foo).toEqualTypeOf<TgpuMutable<d.F32>>();
  });

  it('creates a mutable with a properly typed buffer', ({ root }) => {
    const foo = root.createMutable(d.f32, 123);
    expectTypeOf(foo.buffer).toEqualTypeOf<TgpuBuffer<d.F32> & StorageFlag>();
  });

  it('does not accept non-host-shareable schemas', ({ root }) => {
    // @ts-expect-error: bool is not allowed in mutable schemas
    attest(() => root.createMutable(d.bool)).type.errors.snap(
      `No overload matches this call.Overload 1 of 4, '(typeSchema: "(Error) Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<Bool>> | undefined): TgpuMutable<Bool>', gave the following error.Argument of type 'Bool' is not assignable to parameter of type '"(Error) Bool is not host-shareable, use U32 or I32 instead"'.
Overload 2 of 4, '(typeSchema: "(Error) Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<Bool>> | ((buffer: TgpuBuffer<NoInfer<Bool>>) => void) | undefined): TgpuMutable<...>', gave the following error.Argument of type 'Bool' is not assignable to parameter of type '"(Error) Bool is not host-shareable, use U32 or I32 instead"'.`,
    );

    // @ts-expect-error: bool is not allowed in mutable schemas
    attest(() => root.createMutable(d.arrayOf(d.bool, 16))).type.errors.snap(
      `No overload matches this call.Overload 1 of 4, '(typeSchema: "(Error) in array element — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslArray<Bool>>> | undefined): TgpuMutable<...>', gave the following error.Argument of type 'WgslArray<Bool>' is not assignable to parameter of type '"(Error) in array element — Bool is not host-shareable, use U32 or I32 instead"'.
Overload 2 of 4, '(typeSchema: "(Error) in array element — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslArray<Bool>>> | ((buffer: TgpuBuffer<...>) => void) | undefined): TgpuMutable<...>', gave the following error.Argument of type 'WgslArray<Bool>' is not assignable to parameter of type '"(Error) in array element — Bool is not host-shareable, use U32 or I32 instead"'.`,
    );

    // @ts-expect-error: bool is not allowed in mutable schemas
    attest(() => root.createMutable(d.struct({ foo: d.bool }))).type.errors.snap(
      `No overload matches this call.Overload 1 of 4, '(typeSchema: "(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslStruct<{ foo: Bool; }>>> | undefined): TgpuMutable<...>', gave the following error.Argument of type 'WgslStruct<{ foo: Bool; }>' is not assignable to parameter of type '"(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead"'.
Overload 2 of 4, '(typeSchema: "(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslStruct<{ foo: Bool; }>>> | ((buffer: TgpuBuffer<...>) => void) | undefined): TgpuMutable<...>', gave the following error.Argument of type 'WgslStruct<{ foo: Bool; }>' is not assignable to parameter of type '"(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead"'.`,
    );
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

  it('creates a readonly with initial value', ({ root }) => {
    const foo = root.createReadonly(d.f32, 123);
    expectTypeOf(foo).toEqualTypeOf<TgpuReadonly<d.F32>>();
  });

  it('creates a readonly with a properly typed buffer', ({ root }) => {
    const foo = root.createReadonly(d.f32, 123);
    expectTypeOf(foo.buffer).toEqualTypeOf<TgpuBuffer<d.F32> & StorageFlag>();
  });

  it('does not accept non-host-shareable schemas', ({ root }) => {
    // @ts-expect-error: bool is not allowed in readonly schemas
    attest(() => root.createReadonly(d.bool)).type.errors.snap(
      `No overload matches this call.Overload 1 of 4, '(typeSchema: "(Error) Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<Bool>> | undefined): TgpuReadonly<Bool>', gave the following error.Argument of type 'Bool' is not assignable to parameter of type '"(Error) Bool is not host-shareable, use U32 or I32 instead"'.
Overload 2 of 4, '(typeSchema: "(Error) Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<Bool>> | ((buffer: TgpuBuffer<NoInfer<Bool>>) => void) | undefined): TgpuReadonly<...>', gave the following error.Argument of type 'Bool' is not assignable to parameter of type '"(Error) Bool is not host-shareable, use U32 or I32 instead"'.`,
    );

    // @ts-expect-error: bool is not allowed in readonly schemas
    attest(() => root.createReadonly(d.arrayOf(d.bool, 16))).type.errors.snap(
      `No overload matches this call.Overload 1 of 4, '(typeSchema: "(Error) in array element — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslArray<Bool>>> | undefined): TgpuReadonly<...>', gave the following error.Argument of type 'WgslArray<Bool>' is not assignable to parameter of type '"(Error) in array element — Bool is not host-shareable, use U32 or I32 instead"'.
Overload 2 of 4, '(typeSchema: "(Error) in array element — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslArray<Bool>>> | ((buffer: TgpuBuffer<...>) => void) | undefined): TgpuReadonly<...>', gave the following error.Argument of type 'WgslArray<Bool>' is not assignable to parameter of type '"(Error) in array element — Bool is not host-shareable, use U32 or I32 instead"'.`,
    );

    // @ts-expect-error: bool is not allowed in readonly schemas
    attest(() => root.createReadonly(d.struct({ foo: d.bool }))).type.errors.snap(
      `No overload matches this call.Overload 1 of 4, '(typeSchema: "(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslStruct<{ foo: Bool; }>>> | undefined): TgpuReadonly<...>', gave the following error.Argument of type 'WgslStruct<{ foo: Bool; }>' is not assignable to parameter of type '"(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead"'.
Overload 2 of 4, '(typeSchema: "(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslStruct<{ foo: Bool; }>>> | ((buffer: TgpuBuffer<...>) => void) | undefined): TgpuReadonly<...>', gave the following error.Argument of type 'WgslStruct<{ foo: Bool; }>' is not assignable to parameter of type '"(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead"'.`,
    );
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

  it('creates a uniform with initial value', ({ root }) => {
    const foo = root.createUniform(d.f32, 123);
    expectTypeOf(foo).toEqualTypeOf<TgpuUniform<d.F32>>();
  });

  it('creates a uniform with a properly typed buffer', ({ root }) => {
    const foo = root.createUniform(d.f32, 123);
    expectTypeOf(foo.buffer).toEqualTypeOf<TgpuBuffer<d.F32> & UniformFlag>();
  });

  it('does not accept non-host-shareable schemas', ({ root }) => {
    // @ts-expect-error: bool is not allowed in uniform schemas
    attest(() => root.createUniform(d.bool)).type.errors.snap(
      `No overload matches this call.Overload 1 of 4, '(typeSchema: "(Error) Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<Bool>> | undefined): TgpuUniform<Bool>', gave the following error.Argument of type 'Bool' is not assignable to parameter of type '"(Error) Bool is not host-shareable, use U32 or I32 instead"'.
Overload 2 of 4, '(typeSchema: "(Error) Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<Bool>> | ((buffer: TgpuBuffer<NoInfer<Bool>>) => void) | undefined): TgpuUniform<...>', gave the following error.Argument of type 'Bool' is not assignable to parameter of type '"(Error) Bool is not host-shareable, use U32 or I32 instead"'.`,
    );

    // @ts-expect-error: bool is not allowed in uniform schemas
    attest(() => root.createUniform(d.arrayOf(d.bool, 16))).type.errors.snap(
      `No overload matches this call.Overload 1 of 4, '(typeSchema: "(Error) in array element — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslArray<Bool>>> | undefined): TgpuUniform<...>', gave the following error.Argument of type 'WgslArray<Bool>' is not assignable to parameter of type '"(Error) in array element — Bool is not host-shareable, use U32 or I32 instead"'.
Overload 2 of 4, '(typeSchema: "(Error) in array element — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslArray<Bool>>> | ((buffer: TgpuBuffer<...>) => void) | undefined): TgpuUniform<...>', gave the following error.Argument of type 'WgslArray<Bool>' is not assignable to parameter of type '"(Error) in array element — Bool is not host-shareable, use U32 or I32 instead"'.`,
    );

    // @ts-expect-error: bool is not allowed in uniform schemas
    attest(() => root.createUniform(d.struct({ foo: d.bool }))).type.errors.snap(
      `No overload matches this call.Overload 1 of 4, '(typeSchema: "(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslStruct<{ foo: Bool; }>>> | undefined): TgpuUniform<...>', gave the following error.Argument of type 'WgslStruct<{ foo: Bool; }>' is not assignable to parameter of type '"(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead"'.
Overload 2 of 4, '(typeSchema: "(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead", initial?: InferInput<NoInfer<WgslStruct<{ foo: Bool; }>>> | ((buffer: TgpuBuffer<...>) => void) | undefined): TgpuUniform<...>', gave the following error.Argument of type 'WgslStruct<{ foo: Bool; }>' is not assignable to parameter of type '"(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead"'.`,
    );
  });
});
