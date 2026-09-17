import { describe, expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('tgpu.immediateVar', () => {
  describe('resolution', () => {
    it('resolves to a var<immediate> declaration without bindings', () => {
      const level = tgpu['~unstable'].immediateVar(d.f32);
      const fn1 = tgpu.fn([], d.f32)(() => level.$);

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "var<immediate> level: f32;

        fn fn1() -> f32 {
          return level;
        }"
      `);
    });

    it('allows aliasing a struct immediate in a variable declaration', () => {
      const Params = d.struct({ intensity: d.f32, color: d.vec3f });
      const params = tgpu['~unstable'].immediateVar(Params);
      const fn1 = tgpu.fn(
        [],
        d.vec3f,
      )(() => {
        'use gpu';
        const p = params.$;
        return p.color * p.intensity;
      });

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "struct Params {
          intensity: f32,
          color: vec3f,
        }

        var<immediate> params: Params;

        fn fn1() -> vec3f {
          let p = (&params);
          return ((*p).color * (*p).intensity);
        }"
      `);
    });

    it('allows aliasing a vector immediate in a variable declaration', () => {
      const offset = tgpu['~unstable'].immediateVar(d.vec4f);
      const fn1 = tgpu.fn(
        [],
        d.vec2f,
      )(() => {
        'use gpu';
        const o = offset.$;
        return o.xy * o.w;
      });

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "var<immediate> offset: vec4f;

        fn fn1() -> vec2f {
          let o = (&offset);
          return ((*o).xy * (*o).w);
        }"
      `);
    });

    it('throws when two different immediate variables are used in one shader', () => {
      const first = tgpu['~unstable'].immediateVar(d.f32);
      const second = tgpu['~unstable'].immediateVar(d.f32);
      const fn1 = tgpu.fn([], d.f32)(() => first.$ + second.$);

      expect(() => tgpu.resolve([fn1])).toThrow(
        /Cannot use both immediate variables 'first' and 'second' in a single shader/,
      );
    });

    it('allows multiple immediates when comptime prunes all but one', () => {
      const slot = tgpu.slot<boolean>();
      const first = tgpu['~unstable'].immediateVar(d.f32);
      const second = tgpu['~unstable'].immediateVar(d.f32);
      const choose = tgpu.fn(
        [],
        d.f32,
      )(() => {
        'use gpu';
        return slot.$ ? first.$ : second.$;
      });
      expect(tgpu.resolve([choose.with(slot, true)])).toMatchInlineSnapshot(`
        "var<immediate> first: f32;

        fn choose() -> f32 {
          return first;
        }"
      `);
      expect(tgpu.resolve([choose.with(slot, false)])).toMatchInlineSnapshot(`
        "var<immediate> second: f32;

        fn choose() -> f32 {
          return second;
        }"
      `);
    });

    it('allows using the same immediate variable in multiple functions', () => {
      const level = tgpu['~unstable'].immediateVar(d.f32);
      const inner = tgpu.fn([], d.f32)(() => level.$);
      const outer = tgpu.fn([], d.f32)(() => inner() + level.$);

      expect(tgpu.resolve([outer])).toMatchInlineSnapshot(`
        "var<immediate> level: f32;

        fn inner() -> f32 {
          return level;
        }

        fn outer() -> f32 {
          return (inner() + level);
        }"
      `);
    });

    it('throws when mutating an immediate variable in a shader', () => {
      const level = tgpu['~unstable'].immediateVar(d.f32);
      const fn1 = tgpu.fn([])(() => {
        // @ts-expect-error: immediates are read-only
        level.$ = 1;
      });

      expect(() => tgpu.resolve([fn1])).toThrow(/immediate variables cannot be mutated/);
    });
  });

  describe('schema validation', () => {
    it('rejects anything but scalars, vectors, matrices and structs of those', () => {
      const Nested = d.struct({ inner: d.struct({ values: d.arrayOf(d.f32, 4) }) });
      expect(() => tgpu['~unstable'].immediateVar(Nested)).toThrow(/can only hold scalars/);
      expect(() => tgpu['~unstable'].immediateVar(d.atomic(d.u32))).toThrow(
        /can only hold scalars/,
      );
      expect(() => tgpu['~unstable'].immediateVar(d.texture2d())).toThrow(/can only hold scalars/);
      expect(() => tgpu['~unstable'].immediateVar(d.sampler())).toThrow(/can only hold scalars/);
      expect(() => tgpu['~unstable'].immediateVar(d.ptrFn(d.u32))).toThrow(/can only hold scalars/);
      expect(() => tgpu['~unstable'].immediateVar(d.struct({ flag: d.bool }))).toThrow(
        /cannot contain booleans/,
      );
      expect(() => tgpu['~unstable'].immediateVar(d.vec3b)).toThrow(/cannot contain booleans/);
    });

    it('rejects decorated schemas', () => {
      expect(() => tgpu['~unstable'].immediateVar(d.size(32, d.u32))).toThrow(
        /cannot be decorated types/,
      );
    });
  });

  describe('normal-mode access', () => {
    it('throws when accessed outside of codegen', () => {
      const level = tgpu['~unstable'].immediateVar(d.f32);
      expect(() => level.$).toThrow(/inaccessible during normal JS execution/);
    });
  });

  describe('accessors', () => {
    it('resolves an accessor fulfilled by an immediate variable', () => {
      const level = tgpu.accessor(d.f32);
      const levelImmediate = tgpu['~unstable'].immediateVar(d.f32);
      const fn1 = tgpu
        .fn(
          [],
          d.f32,
        )(() => level.$)
        .with(level, levelImmediate);

      expect(tgpu.resolve([fn1])).toMatchInlineSnapshot(`
        "var<immediate> levelImmediate: f32;

        fn fn1() -> f32 {
          return levelImmediate;
        }"
      `);
    });
  });
});
