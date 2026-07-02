import { describe, expect, expectTypeOf } from 'vitest';
import * as d from 'typegpu/data';
import { it } from 'typegpu-testing-utility';
import {
  tgpu,
  type StorageFlag,
  type TgpuBuffer,
  type TgpuMutable,
  type TgpuReadonly,
  type TgpuUniform,
  type UniformFlag,
} from 'typegpu';
import { attest } from '@ark/attest';

describe('root.createMutable', () => {
  it('is resolvable', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage');
    const mutable = buffer.as('mutable');

    expect(tgpu.resolve([mutable])).toMatchInlineSnapshot(
      `"@group(0) @binding(0) var<storage, read_write> buffer: f32;"`,
    );
  });

  it('represents a `number` value', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage');
    const mutable = buffer.as('mutable');

    expectTypeOf<d.Infer<typeof mutable>>().toEqualTypeOf<number>();
  });

  it('resolves to buffer binding in code', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage').$name('param');
    const mutable = buffer.as('mutable');

    const main = tgpu.fn([])`() { let y = hello; }`.$uses({ hello: mutable });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> param: f32;

      fn main() { let y = param; }"
    `);
  });

  it('resolves to buffer binding in tgsl functions', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage').$name('param');
    const mutable = buffer.as('mutable');

    const func = tgpu.fn([])(() => {
      const x = mutable.$;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> param: f32;

      fn func() {
        let x = param;
      }"
    `);
  });

  it('allows accessing fields in a struct stored in its buffer', ({ root }) => {
    const Boid = d
      .struct({
        pos: d.vec3f,
        vel: d.vec3u,
      })
      .$name('Boid');

    const buffer = root.createBuffer(Boid).$usage('storage').$name('boid');
    const mutable = buffer.as('mutable');

    const func = tgpu.fn([])(() => {
      const pos = mutable.$.pos;
      const velX = mutable.$.vel.x;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3u,
      }

      @group(0) @binding(0) var<storage, read_write> boid: Boid;

      fn func() {
        let pos = (&boid.pos);
        let velX = boid.vel.x;
      }"
    `);
  });

  describe('simulate mode', () => {
    it('allows accessing .$ in simulate mode', ({ root }) => {
      const buffer = root.createBuffer(d.u32, 0).$usage('storage');
      const mutable = buffer.as('mutable');

      const incrementThreeTimes = tgpu.fn([])(() => {
        mutable.$++;
        mutable.$++;
        mutable.$++;
      });

      const result = tgpu['~unstable'].simulate(() => {
        incrementThreeTimes();
        return mutable.$;
      });
      expect(result.value).toBe(3);
    });
  });

  it('allows creating bufferUsages only for buffers allowing them', ({ root }) => {
    root.createBuffer(d.u32, 2).$usage('storage').as('mutable');
    root.createBuffer(d.u32, 2).$usage('storage', 'uniform').as('mutable');
    root.createBuffer(d.u32, 2).$usage('vertex', 'storage').as('mutable');
    // @ts-expect-error
    expect(() => root.createBuffer(d.u32, 2).as('mutable')).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot call as('mutable') on buffer:<unnamed>, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.]`,
    );
    expect(() =>
      root
        .createBuffer(d.u32, 2)
        .$usage('uniform')
        // @ts-expect-error
        .as('mutable'),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot call as('mutable') on buffer:<unnamed>, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.]`,
    );
  });

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
      "Argument of type 'Bool' is not assignable to parameter of type '\"(Error) Bool is not host-shareable, use U32 or I32 instead\"'.",
    );

    // @ts-expect-error: bool is not allowed in mutable schemas
    attest(() => root.createMutable(d.arrayOf(d.bool, 16))).type.errors.snap(
      "Argument of type 'WgslArray<Bool>' is not assignable to parameter of type '\"(Error) in array element — Bool is not host-shareable, use U32 or I32 instead\"'.",
    );

    // @ts-expect-error: bool is not allowed in mutable schemas
    attest(() => root.createMutable(d.struct({ foo: d.bool }))).type.errors.snap(
      "Argument of type 'WgslStruct<{ foo: Bool; }>' is not assignable to parameter of type '\"(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead\"'.",
    );
  });

  it('hints initial struct props in mutable', ({ root }) => {
    const Boid = d.struct({ id: d.u32, prop: d.vec2u });
    attest(() =>
      root.createMutable(Boid, {
        // @ts-expect-error
        '': undefined,
      }),
    ).completions({
      '': ['id', 'prop'],
    });
  });

  it('auto types buffer on mapped initialized in mutable', ({ root }) => {
    const Entry = d.struct({
      id: d.u32,
      values: d.vec3f,
    });
    const Entries = d.arrayOf(Entry, 2);

    root.createMutable(Entries, (mappedBuffer) => {
      expectTypeOf(mappedBuffer).toEqualTypeOf<TgpuBuffer<typeof Entries>>();
      mappedBuffer.write([{ id: 1, values: d.vec3f() }]);
    });
  });
});

describe('root.createReadonly', () => {
  it('is resolvable', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage');
    const readonly = buffer.as('readonly');

    expect(tgpu.resolve([readonly])).toMatchInlineSnapshot(
      `"@group(0) @binding(0) var<storage, read> buffer: f32;"`,
    );
  });

  it('represents a `number` value', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage');
    const readonly = buffer.as('readonly');

    expectTypeOf<d.Infer<typeof readonly>>().toEqualTypeOf<number>();
  });

  it('resolves to buffer binding in code', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage').$name('param');
    const readonly = buffer.as('readonly');

    const main = tgpu.fn([])`() { let y = hello; }`.$uses({ hello: readonly });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> param: f32;

      fn main() { let y = param; }"
    `);
  });

  it('resolves to buffer binding in TGSL functions', ({ root }) => {
    const paramBuffer = root.createBuffer(d.f32).$usage('storage');
    const paramReadonly = paramBuffer.as('readonly');

    const func = tgpu.fn([])(() => {
      const x = paramReadonly.$;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> paramBuffer: f32;

      fn func() {
        let x = paramBuffer;
      }"
    `);
  });

  it('allows accessing fields in a struct stored in its buffer', ({ root }) => {
    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3u,
    });

    const boidBuffer = root.createBuffer(Boid).$usage('storage').$name('boid');
    const boidReadonly = boidBuffer.as('readonly');

    const func = tgpu.fn([])(() => {
      const pos = boidReadonly.$.pos;
      const velX = boidReadonly.$.vel.x;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3u,
      }

      @group(0) @binding(0) var<storage, read> boid: Boid;

      fn func() {
        let pos = (&boid.pos);
        let velX = boid.vel.x;
      }"
    `);
  });

  it('cannot be accessed via .$ top-level', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage');
    const readonly = buffer.as('readonly');

    expect(() => readonly.$).toThrowErrorMatchingInlineSnapshot(
      `[Error: .$ is inaccessible during normal JS execution. Try \`.read()\`]`,
    );
  });

  it('cannot be accessed via .$ in a function called top-level', ({ root }) => {
    const fooBuffer = root.createBuffer(d.f32).$usage('storage');
    const readonly = fooBuffer.as('readonly');

    const foo = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return readonly.$; // accessing GPU resource
    });

    expect(() => foo()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:foo: Cannot access buffer:fooBuffer. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation]
    `);
  });

  it('forbids assignment to readonlys', ({ root }) => {
    const myReadonly = root.createReadonly(d.vec2u);
    const myFn = () => {
      'use gpu';
      // @ts-expect-error
      myReadonly.$ = d.vec2u();
    };

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:myFn
      - fn*:myFn(): 'myReadonly.$ = d.vec2u()' is invalid, because readonly buffers cannot be mutated.]
    `);
  });

  it('forbids assignment to readonly props', ({ root }) => {
    const myReadonly = root.createReadonly(d.vec2u);
    const myFn = () => {
      'use gpu';
      myReadonly.$.x = 1;
    };

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:myFn
      - fn*:myFn(): 'myReadonly.$.x = 1' is invalid, because readonly buffers cannot be mutated.]
    `);
  });

  describe('simulate mode', () => {
    it('allows accessing .$ in simulate mode', ({ root }) => {
      const buffer = root.createBuffer(d.f32, 123).$usage('storage');
      const readonly = buffer.as('readonly');

      const foo = tgpu.fn([])(() => {
        return readonly.$; // accessing GPU resource
      });

      const result = tgpu['~unstable'].simulate(foo);
      expect(result.value).toBe(123);
    });
  });

  it('allows creating bufferUsages only for buffers allowing them', ({ root }) => {
    root.createBuffer(d.u32, 2).$usage('storage').as('readonly');
    root.createBuffer(d.u32, 2).$usage('storage', 'uniform').as('readonly');
    root.createBuffer(d.u32, 2).$usage('storage', 'vertex').as('readonly');
    // @ts-expect-error
    expect(() => root.createBuffer(d.u32, 2).as('readonly')).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot call as('readonly') on buffer:<unnamed>, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.]`,
    );
    expect(() =>
      root
        .createBuffer(d.u32, 2)
        .$usage('uniform')
        // @ts-expect-error
        .as('readonly'),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot call as('readonly') on buffer:<unnamed>, as it is not allowed to be used as storage. To allow it, call .$usage('storage') when creating the buffer.]`,
    );
  });

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
      "Argument of type 'Bool' is not assignable to parameter of type '\"(Error) Bool is not host-shareable, use U32 or I32 instead\"'.",
    );

    // @ts-expect-error: bool is not allowed in readonly schemas
    attest(() => root.createReadonly(d.arrayOf(d.bool, 16))).type.errors.snap(
      "Argument of type 'WgslArray<Bool>' is not assignable to parameter of type '\"(Error) in array element — Bool is not host-shareable, use U32 or I32 instead\"'.",
    );

    // @ts-expect-error: bool is not allowed in readonly schemas
    attest(() => root.createReadonly(d.struct({ foo: d.bool }))).type.errors.snap(
      "Argument of type 'WgslStruct<{ foo: Bool; }>' is not assignable to parameter of type '\"(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead\"'.",
    );
  });

  it('hints initial struct props in readonly', ({ root }) => {
    const Boid = d.struct({ id: d.u32, prop: d.vec2u });
    attest(() =>
      root.createReadonly(Boid, {
        // @ts-expect-error
        '': undefined,
      }),
    ).completions({
      '': ['id', 'prop'],
    });
  });

  it('auto types buffer on mapped initialized in readonly', ({ root }) => {
    const Entry = d.struct({
      id: d.u32,
      values: d.vec3f,
    });
    const Entries = d.arrayOf(Entry, 2);

    root.createReadonly(Entries, (mappedBuffer) => {
      expectTypeOf(mappedBuffer).toEqualTypeOf<TgpuBuffer<typeof Entries>>();
      mappedBuffer.write([{ id: 1, values: d.vec3f() }]);
    });
  });
});

describe('root.createUniform', () => {
  it('is resolvable', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform');
    const uniform = buffer.as('uniform');

    expect(tgpu.resolve([uniform])).toMatchInlineSnapshot(
      `"@group(0) @binding(0) var<uniform> buffer: f32;"`,
    );
  });

  it('represents a `number` value', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform');
    const uniform = buffer.as('uniform');

    expectTypeOf<d.Infer<typeof uniform>>().toEqualTypeOf<number>();
  });

  it('resolves to buffer binding in code', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform').$name('param');
    const uniform = buffer.as('uniform');

    const main = tgpu.fn([])`() { let y = hello; }`.$uses({ hello: uniform });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> param: f32;

      fn main() { let y = param; }"
    `);
  });

  it('resolves to buffer binding in tgsl functions', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform').$name('param');
    const uniform = buffer.as('uniform');

    const func = tgpu.fn([])(() => {
      const x = uniform.$;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> param: f32;

      fn func() {
        let x = param;
      }"
    `);
  });

  it('allows accessing fields in a struct stored in its buffer', ({ root }) => {
    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3u,
    });

    const buffer = root.createBuffer(Boid).$usage('uniform').$name('boid');
    const uniform = buffer.as('uniform');

    const func = tgpu.fn([])(() => {
      const pos = uniform.$.pos;
      const velX = uniform.$.vel.x;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3u,
      }

      @group(0) @binding(0) var<uniform> boid: Boid;

      fn func() {
        let pos = (&boid.pos);
        let velX = boid.vel.x;
      }"
    `);
  });

  it('forbids assignment to uniforms', ({ root }) => {
    const myUniform = root.createUniform(d.vec2u);
    const myFn = () => {
      'use gpu';
      // @ts-expect-error: .$ is a readonly property
      myUniform.$ = d.vec2u();
    };

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:myFn
      - fn*:myFn(): 'myUniform.$ = d.vec2u()' is invalid, because uniform buffers cannot be mutated.]
    `);
  });

  it('forbids assignment to uniform props', ({ root }) => {
    const myUniform = root.createUniform(d.vec2u);
    const myFn = () => {
      'use gpu';
      myUniform.$.x = 1;
    };

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:myFn
      - fn*:myFn(): 'myUniform.$.x = 1' is invalid, because uniform buffers cannot be mutated.]
    `);
  });

  it('allows creating shorthands only for buffers allowing them', ({ root }) => {
    root.createBuffer(d.u32, 2).$usage('uniform').as('uniform');
    root.createBuffer(d.u32, 2).$usage('uniform', 'storage').as('uniform');
    root.createBuffer(d.u32, 2).$usage('uniform', 'vertex').as('uniform');
    // @ts-expect-error
    expect(() => root.createBuffer(d.u32, 2).as('uniform')).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot call as('uniform') on buffer:<unnamed>, as it is not allowed to be used as a uniform. To allow it, call .$usage('uniform') when creating the buffer.]`,
    );
    expect(() =>
      root
        .createBuffer(d.u32, 2)
        .$usage('storage')
        // @ts-expect-error
        .as('uniform'),
    ).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot call as('uniform') on buffer:<unnamed>, as it is not allowed to be used as a uniform. To allow it, call .$usage('uniform') when creating the buffer.]`,
    );
  });

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
      "Argument of type 'Bool' is not assignable to parameter of type '\"(Error) Bool is not host-shareable, use U32 or I32 instead\"'.",
    );

    // @ts-expect-error: bool is not allowed in uniform schemas
    attest(() => root.createUniform(d.arrayOf(d.bool, 16))).type.errors.snap(
      "Argument of type 'WgslArray<Bool>' is not assignable to parameter of type '\"(Error) in array element — Bool is not host-shareable, use U32 or I32 instead\"'.",
    );

    // @ts-expect-error: bool is not allowed in uniform schemas
    attest(() => root.createUniform(d.struct({ foo: d.bool }))).type.errors.snap(
      "Argument of type 'WgslStruct<{ foo: Bool; }>' is not assignable to parameter of type '\"(Error) in struct property 'foo' — Bool is not host-shareable, use U32 or I32 instead\"'.",
    );
  });

  it('hints initial struct props in uniform', ({ root }) => {
    const Boid = d.struct({ id: d.u32, prop: d.vec2u });
    attest(() =>
      root.createUniform(Boid, {
        // @ts-expect-error
        '': undefined,
      }),
    ).completions({
      '': ['id', 'prop'],
    });
  });

  it('auto types buffer on mapped initialized in uniform', ({ root }) => {
    const Entry = d.struct({
      id: d.u32,
      values: d.vec3f,
    });
    const Entries = d.arrayOf(Entry, 2);

    root.createUniform(Entries, (mappedBuffer) => {
      expectTypeOf(mappedBuffer).toEqualTypeOf<TgpuBuffer<typeof Entries>>();
      mappedBuffer.write([{ id: 1, values: d.vec3f() }]);
    });
  });
});
