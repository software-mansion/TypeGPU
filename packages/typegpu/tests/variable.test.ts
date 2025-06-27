import { describe, expect, it } from 'vitest';
import type {
  TgpuVar,
  VariableScope,
} from '../src/core/variable/tgpuVariable.ts';
import * as d from '../src/data/index.ts';
import tgpu from '../src/index.ts';
import { parse, parseResolved } from './utils/parseResolved.ts';

describe('var', () => {
  it('should inject variable declaration when used in functions', () => {
    const x = tgpu['~unstable'].privateVar(d.u32, 2);
    const fn1 = tgpu.fn([])`() {
        let y = x;
        return x;
      }`
      .$uses({ x });

    expect(parseResolved({ fn1 })).toBe(
      parse(`
        var<private> x: u32 = 2;
        fn fn1() {
          let y = x;
          return x;
        }
      `),
    );
  });

  it('should properly resolve variables', () => {
    function test(
      variable: TgpuVar<VariableScope, d.AnyWgslData>,
      expected: string,
    ) {
      expect(parseResolved({ x: variable })).toBe(parse(expected));
    }

    test(
      tgpu['~unstable'].privateVar(d.u32, 2).$name('x'),
      'var<private> x: u32 = 2;',
    );
    test(
      tgpu['~unstable'].privateVar(d.f32, 1.5).$name('x'),
      'var<private> x: f32 = 1.5;',
    );
    test(
      tgpu['~unstable'].privateVar(d.u32).$name('x'),
      'var<private> x: u32;',
    );
    test(
      tgpu['~unstable'].workgroupVar(d.f32).$name('x'),
      'var<workgroup> x: f32;',
    );

    test(
      tgpu['~unstable'].privateVar(d.vec2u, d.vec2u(1, 2)).$name('x'),
      'var<private> x: vec2u = vec2u(1, 2);',
    );

    test(
      tgpu['~unstable'].privateVar(d.vec3f, d.vec3f()).$name('x'),
      'var<private> x: vec3f = vec3f(0, 0, 0);',
    );

    test(
      tgpu['~unstable'].privateVar(d.arrayOf(d.u32, 2), [1, 2]).$name('x'),
      'var<private> x: array<u32, 2> = array(1, 2);',
    );

    const s = d.struct({ x: d.u32, y: d.vec2i }).$name('s');

    test(
      tgpu['~unstable'].privateVar(s, { x: 2, y: d.vec2i(1, 2) }).$name('x'),
      `
      struct s {
        x: u32,
        y: vec2i,
      }

      var<private> x: s = s(2, vec2i(1, 2));`,
    );

    const a = d.arrayOf(s, 2);

    test(
      tgpu['~unstable']
        .privateVar(a, [
          { x: 1, y: d.vec2i(2, 3) },
          { x: 4, y: d.vec2i(5, 6) },
        ])
        .$name('x'),
      `
      struct s {
        x: u32,
        y: vec2i,
      }

      var<private> x: array<s, 2> = array(s(1, vec2i(2, 3)), s(4, vec2i(5, 6)));`,
    );
  });

  it('allows accessing variables in TGSL through .value', () => {
    const Boid = d.struct({
      pos: d.vec3f,
      vel: d.vec3u,
    });

    const boid = tgpu['~unstable'].privateVar(Boid, {
      pos: d.vec3f(1, 2, 3),
      vel: d.vec3u(4, 5, 6),
    });

    const func = tgpu.fn([])(() => {
      const pos = boid.value;
      const vel = boid.value.vel;
      const velX = boid.value.vel.x;
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

        var<private> boid: Boid = Boid(vec3f(1, 2, 3), vec3u(4, 5, 6));

        fn func() {
          var pos = boid;
          var vel = boid.vel;
          var velX = boid.vel.x;
        }`),
    );
  });
});
