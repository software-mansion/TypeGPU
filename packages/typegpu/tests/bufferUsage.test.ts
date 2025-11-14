import { describe, expect, expectTypeOf } from 'vitest';

import tgpu from '../src/index.ts';

import * as d from '../src/data/index.ts';
import type { Infer } from '../src/shared/repr.ts';
import { it } from './utils/extendedIt.ts';

describe('TgpuBufferUniform', () => {
  it('represents a `number` value', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform');
    const uniform = buffer.as('uniform');

    expectTypeOf<Infer<typeof uniform>>().toEqualTypeOf<number>();
  });

  it('resolves to buffer binding in code', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform').$name('param');
    const uniform = buffer.as('uniform');

    const main = tgpu.fn([])`() { let y = hello; }`
      .$uses({ hello: uniform });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> param: f32;

      fn main() { let y = param; }"
    `);
  });

  it('resolves to buffer binding in tgsl functions', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform').$name('param');
    const uniform = buffer.as('uniform');

    const func = tgpu.fn([])(() => {
      const x = uniform.value;
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
      const pos = uniform.value.pos;
      const velX = uniform.value.vel.x;
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
});

describe('TgpuBufferMutable', () => {
  it('represents a `number` value', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage');
    const mutable = buffer.as('mutable');

    expectTypeOf<Infer<typeof mutable>>().toEqualTypeOf<number>();
  });

  it('resolves to buffer binding in code', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage').$name('param');
    const mutable = buffer.as('mutable');

    const main = tgpu.fn([])`() { let y = hello; }`
      .$uses({ hello: mutable });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read_write> param: f32;

      fn main() { let y = param; }"
    `);
  });

  it('resolves to buffer binding in tgsl functions', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage').$name('param');
    const mutable = buffer.as('mutable');

    const func = tgpu.fn([])(() => {
      const x = mutable.value;
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
      const pos = mutable.value.pos;
      const velX = mutable.value.vel.x;
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
});

describe('TgpuBufferReadonly', () => {
  it('represents a `number` value', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage');
    const readonly = buffer.as('readonly');

    expectTypeOf<Infer<typeof readonly>>().toEqualTypeOf<number>();
  });

  it('resolves to buffer binding in code', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage').$name('param');
    const readonly = buffer.as('readonly');

    const main = tgpu.fn([])`() { let y = hello; }`
      .$uses({ hello: readonly });

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> param: f32;

      fn main() { let y = param; }"
    `);
  });

  it('resolves to buffer binding in TGSL functions', ({ root }) => {
    const paramBuffer = root.createBuffer(d.f32).$usage('storage');
    const paramReadonly = paramBuffer.as('readonly');

    const func = tgpu.fn([])(() => {
      const x = paramReadonly.value;
    });

    expect(tgpu.resolve([func])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> paramBuffer: f32;

      fn func() {
        let x = paramBuffer;
      }"
    `);
  });

  it('allows accessing fields in a struct stored in its buffer', ({ root }) => {
    const Boid = d
      .struct({
        pos: d.vec3f,
        vel: d.vec3u,
      });

    const boidBuffer = root.createBuffer(Boid).$usage('storage').$name('boid');
    const boidReadonly = boidBuffer.as('readonly');

    const func = tgpu.fn([])(() => {
      const pos = boidReadonly.value.pos;
      const velX = boidReadonly.value.vel.x;
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

  it('cannot be accessed via .$ or .value top-level', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage');
    const readonly = buffer.as('readonly');

    expect(() => readonly.$).toThrowErrorMatchingInlineSnapshot(
      '[Error: .$ and .value are inaccessible during normal JS execution. Try `.read()`]',
    );
    expect(() => readonly.value).toThrowErrorMatchingInlineSnapshot(
      '[Error: .$ and .value are inaccessible during normal JS execution. Try `.read()`]',
    );
  });

  it('cannot be accessed via .$ or .value in a function called top-level', ({ root }) => {
    const fooBuffer = root.createBuffer(d.f32).$usage('storage');
    const readonly = fooBuffer.as('readonly');

    const foo = tgpu.fn([], d.f32)(() => {
      return readonly.$; // accessing GPU resource
    });

    expect(() => foo()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:foo: Cannot access buffer:fooBuffer. TypeGPU functions that depends on GPU resources need to be part of a compute dispatch, draw call or simulation]
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
});
