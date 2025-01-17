import { parse } from 'tgpu-wgsl-parser';
import { describe, expect, expectTypeOf } from 'vitest';

import tgpu from '../src';
import { asUniform } from '../src/core/buffer/bufferUsage';
import * as d from '../src/data';
import type { Infer } from '../src/shared/repr';
import { it } from './utils/extendedIt';

describe('TgpuBufferUniform', () => {
  it('represents a `number` value', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform');
    const uniform = asUniform(buffer);

    expectTypeOf<Infer<typeof uniform>>().toEqualTypeOf<number>();
  });

  it('resolves to buffer binding in code', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform').$name('param');
    const uniform = asUniform(buffer);

    const resolved = tgpu.resolve({
      template: `
        fn m() {
          let y = hello;
        }`,
      externals: { hello: uniform },
      names: 'strict',
    });

    expect(parse(resolved)).toEqual(
      parse(`
        @group(0) @binding(0) var<uniform> param: f32;

        fn m() {
          let y = param;
        }`),
    );
  });

  it('resolves to buffer binding in tgsl functions', ({ root }) => {
    const buffer = root.createBuffer(d.f32).$usage('uniform').$name('param');
    const uniform = asUniform(buffer);

    const func = tgpu['~unstable'].fn([]).does(() => {
      const x = uniform.value;
    });

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toEqual(
      parse(`
        @group(0) @binding(0) var<uniform> param: f32;

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

    const buffer = root.createBuffer(Boid).$usage('uniform').$name('boid');
    const uniform = asUniform(buffer);

    const func = tgpu['~unstable'].fn([]).does(() => {
      const pos = uniform.value.pos;
      const velX = uniform.value.vel.x;
    });

    const resolved = tgpu.resolve({
      externals: { func },
      names: 'strict',
    });

    expect(parse(resolved)).toEqual(
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
