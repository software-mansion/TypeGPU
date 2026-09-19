import { describe, expect, expectTypeOf } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d, std } from 'typegpu';

describe('isKnownAtComptime', () => {
  it('returns true during normal JS execution', () => {
    expect(std.isKnownAtComptime(123)).toBe(true);
    expect(std.isKnownAtComptime(d.vec3f(1, 2, 3))).toBe(true);
    expectTypeOf(std.isKnownAtComptime(123)).toEqualTypeOf<boolean>();
  });

  it('returns true for literals during generation', () => {
    const f = () => {
      'use gpu';
      return std.isKnownAtComptime(123) ? 7 : -7;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return 7;
      }"
    `);
  });

  it('returns false for function arguments', () => {
    const f = tgpu.fn(
      [d.u32],
      d.i32,
    )((a) => {
      'use gpu';
      return std.isKnownAtComptime(a) ? 7 : -7;
    });

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f(a: u32) -> i32 {
        return -7i;
      }"
    `);
  });

  it('returns true for the length of a fixed-size array', () => {
    const layout = tgpu.bindGroupLayout({
      items: { storage: d.arrayOf(d.u32, 3) },
    });

    const f = () => {
      'use gpu';
      return std.isKnownAtComptime(layout.$.items.length) ? 7 : -7;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "fn f() -> i32 {
        return 7;
      }"
    `);
  });

  it('returns false for the length of a runtime-sized array', () => {
    const layout = tgpu.bindGroupLayout({
      items: { storage: d.arrayOf(d.u32) },
    });

    const f = () => {
      'use gpu';
      return std.isKnownAtComptime(layout.$.items.length) ? 7 : -7;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> items: array<u32>;

      fn f() -> i32 {
        return -7;
      }"
    `);
  });

  it('unrolls a loop over a fixed-size array, but keeps a loop for a runtime-sized one', () => {
    const fixed = tgpu.bindGroupLayout({
      boids: { storage: d.arrayOf(d.vec2f, 3) },
    });
    const dynamic = tgpu.bindGroupLayout({
      boids: { storage: d.arrayOf(d.vec2f) },
    });
    const boidsAccess = tgpu.accessor(d.arrayOf(d.vec2f));

    const sum = tgpu.fn(
      [],
      d.vec2f,
    )(() => {
      'use gpu';
      let total = d.vec2f();
      for (const boid of std.isKnownAtComptime(boidsAccess.$.length)
        ? tgpu.unroll(boidsAccess.$)
        : boidsAccess.$) {
        total += boid;
      }
      return total;
    });

    const sumFixed = sum.with(boidsAccess, () => fixed.$.boids);
    const sumDynamic = sum.with(boidsAccess, () => dynamic.$.boids);

    expect(tgpu.resolve([sumFixed, sumDynamic])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<storage, read> boids: array<vec2f, 3>;

      fn sum() -> vec2f {
        var total = vec2f();
        // unrolled iteration #0
        total += boids[0u];
        // unrolled iteration #1
        total += boids[1u];
        // unrolled iteration #2
        total += boids[2u];
        // ---
        return total;
      }

      @group(1) @binding(0) var<storage, read> boids_1: array<vec2f>;

      fn sum_1() -> vec2f {
        var total = vec2f();
        for (var i = 0u; i < arrayLength((&boids_1)); i += 1u) {
          let boid = (&boids_1[i]);
          total += (*boid);
        }
        return total;
      }"
    `);
  });

  it('throws when the argument has possible side effects', () => {
    const counter = tgpu['~unstable'].privateVar(d.u32);
    const bump = tgpu.fn(
      [],
      d.u32,
    )(() => {
      'use gpu';
      counter.$++;
      return counter.$;
    });

    const f = () => {
      'use gpu';
      return std.isKnownAtComptime(bump()) ? 7 : -7;
    };

    expect(() => tgpu.resolve([f])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:f
      - fn*:f()
      - fn:isKnownAtComptime: \`isKnownAtComptime\` received an argument with possible side effects. The expression is never emitted into the shader, so its side effects would silently not happen, and a side-effectful expression is never known at comptime anyway, so the result would always be \`false\`. Remove the check, and run the side effect as a separate statement if it is needed.]
    `);
  });

  it('reports a stored side-effectful result as not known at comptime', () => {
    const counter = tgpu['~unstable'].privateVar(d.u32);
    const bump = tgpu.fn(
      [],
      d.u32,
    )(() => {
      'use gpu';
      counter.$++;
      return counter.$;
    });

    const f = () => {
      'use gpu';
      const n = bump();
      return std.isKnownAtComptime(n) ? 7 : -7;
    };

    expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
      "var<private> counter: u32;

      fn bump() -> u32 {
        counter++;
        return counter;
      }

      fn f() -> i32 {
        let n = bump();
        return -7;
      }"
    `);
  });

  it('returns true inside simulate', () => {
    const result = tgpu['~unstable'].simulate(() => std.isKnownAtComptime(d.vec2f()));

    expect(result.value).toBe(true);
  });
});
