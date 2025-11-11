import { describe, expect, it } from 'vitest';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { asWgsl } from './utils/parseResolved.ts';

describe('tgpu.const', () => {
  it('should inject const declaration when used in functions', () => {
    const x = tgpu.const(d.u32, 2);
    const fn1 = tgpu.fn([], d.u32)`() { return x; }`.$uses({ x });

    expect(asWgsl(fn1)).toMatchInlineSnapshot(`
      "const x: u32 = 2u;

      fn fn1() -> u32{ return x; }"
    `);
  });

  it('allows accessing constants in tgsl through .value', () => {
    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3u,
    });

    const boid = tgpu.const(Boid, {
      pos: d.vec3f(1, 2, 3),
      vel: d.vec3u(4, 5, 6),
    });

    const func = tgpu.fn([])(() => {
      const pos = boid.$;
      const vel = boid.$.vel;
      const velX = boid.$.vel.x;
    });

    expect(asWgsl(func)).toMatchInlineSnapshot(`
      "struct Boid {
        pos: vec3f,
        vel: vec3u,
      }

      const boid: Boid = Boid(vec3f(1, 2, 3), vec3u(4, 5, 6));

      fn func() {
        var pos = boid;
        var vel = boid.vel;
        var velX = boid.vel.x;
      }"
    `);
  });
});
