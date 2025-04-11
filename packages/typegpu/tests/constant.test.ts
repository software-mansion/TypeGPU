import { describe, expect, it } from 'vitest';
import tgpu from '../src';
import * as d from '../src/data';
import { parse } from './utils/parseResolved';
import { parseResolved } from './utils/parseResolved';

describe('tgpu.const', () => {
  it('should inject const declaration when used in functions', () => {
    const x = tgpu['~unstable'].const(d.u32, 2);
    const fn1 = tgpu['~unstable']
      .fn([])
      .does(`() {
        return x;
      }`)
      .$uses({ x })
      .$name('fn1');

    expect(parseResolved({ fn1 })).toEqual(
      parse(`
        const x = 2;
        fn fn1() {
          return x;
        }
      `),
    );
  });

  it('allows accessing constants in tgsl through .value', () => {
    const Boid = d
      .struct({
        pos: d.vec3f,
        vel: d.vec3u,
      })
      .$name('Boid');

    const boidConst = tgpu['~unstable']
      .const(Boid, {
        pos: d.vec3f(1, 2, 3),
        vel: d.vec3u(4, 5, 6),
      })
      .$name('boid');

    const func = tgpu['~unstable'].fn([]).does(() => {
      const pos = boidConst.value;
      const vel = boidConst.value.vel;
      const velX = boidConst.value.vel.x;
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

        const boid = Boid(vec3f(1, 2, 3), vec3u(4, 5, 6));

        fn func() {
          var pos = boid;
          var vel = boid.vel;
          var velX = boid.vel.x;
        }`),
    );
  });
});
