import { describe, expect, expectTypeOf } from 'vitest';
import { parse } from './utils/parseResolved.ts';

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

    const resolved = tgpu.resolve({
      template: `
        fn m() {
          let y = hello;
        }`,
      externals: { hello: uniform },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        @group(0) @binding(0) var<uniform> param: f32;

        fn m() {
          let y = param;
        }`),
    );
  });

  it('resolves to buffer binding in tgsl functions', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform').$name('param');
    const uniform = buffer.as('uniform');

    const func = tgpu.fn([])(() => {
      const x = uniform.value;
    });

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        @group(0) @binding(0) var<uniform> param: f32;

        fn func() {
          var x = param;
        }`),
    );
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

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        struct Boid {
          pos: vec3f,
          vel: vec3u,
        }

        @group(0) @binding(0) var<uniform> boid: Boid;

        fn func() {
          var pos = boid.pos;
          var velX = boid.vel.x;
        }`),
    );
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

    const resolved = tgpu.resolve({
      template: `
        fn m() {
          let y = hello;
        }`,
      externals: { hello: mutable },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        @group(0) @binding(0) var<storage, read_write> param: f32;

        fn m() {
          let y = param;
        }`),
    );
  });

  it('resolves to buffer binding in tgsl functions', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage').$name('param');
    const mutable = buffer.as('mutable');

    const func = tgpu.fn([])(() => {
      const x = mutable.value;
    });

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        @group(0) @binding(0) var<storage, read_write> param: f32;

        fn func() {
          var x = param;
        }`),
    );
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

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        struct Boid {
          pos: vec3f,
          vel: vec3u,
        }

        @group(0) @binding(0) var<storage, read_write> boid: Boid;

        fn func() {
          var pos = boid.pos;
          var velX = boid.vel.x;
        }`),
    );
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

    const resolved = tgpu.resolve({
      template: `
        fn m() {
          let y = hello;
        }`,
      externals: { hello: readonly },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        @group(0) @binding(0) var<storage, read> param: f32;

        fn m() {
          let y = param;
        }`),
    );
  });

  it('resolves to buffer binding in tgsl functions', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('storage').$name('param');
    const readonly = buffer.as('readonly');

    const func = tgpu.fn([])(() => {
      const x = readonly.value;
    });

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        @group(0) @binding(0) var<storage, read> param: f32;

        fn func() {
          var x = param;
        }`),
    );
  });

  it('allows accessing fields in a struct stored in its buffer', ({ root }) => {
    const Boid = d
      .struct({
        pos: d.vec3f,
        vel: d.vec3u,
      })
      .$name('Boid');

    const buffer = root.createBuffer(Boid).$usage('storage').$name('boid');
    const readonly = buffer.as('readonly');

    const func = tgpu.fn([])(() => {
      const pos = readonly.value.pos;
      const velX = readonly.value.vel.x;
    });

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toBe(
      parse(`
        struct Boid {
          pos: vec3f,
          vel: vec3u,
        }

        @group(0) @binding(0) var<storage, read> boid: Boid;

        fn func() {
          var pos = boid.pos;
          var velX = boid.vel.x;
        }`),
    );
  });
});
