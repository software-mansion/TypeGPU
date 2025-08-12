import { describe, expect, it } from 'vitest';
import tgpu from '../../../src/index.ts';
import { not } from '../../../src/std/boolean.ts';
import * as d from '../../../src/data/index.ts';
import { parse, parseResolved } from '../../utils/parseResolved.ts';

describe('!/not', () => {
  describe('in js', () => {
    it('negates true/false', () => {
      expect(not(false)).toStrictEqual(true);
      expect(not(true)).toStrictEqual(false);
    });

    it('negates vectors', () => {
      expect(not(d.vec2b(true, false))).toStrictEqual(d.vec2b(false, true));
      expect(not(d.vec3b(false, false, true))).toStrictEqual(
        d.vec3b(true, true, false),
      );
      expect(not(d.vec4b(true, true, false, false))).toStrictEqual(
        d.vec4b(false, false, true, true),
      );
    });
  });

  describe('in tgsl (compile-time known)', () => {
    it('precomputes with compile-time known scalars', () => {
      const notFalse = tgpu.fn([], d.bool)(() => !false);
      const notTrue = tgpu.fn([], d.bool)(() => !true);

      expect(parseResolved({ notFalse, notTrue })).toEqual(parse(`
        fn notFalse() -> bool { return true; }
        fn notTrue() -> bool { return false; }
      `));
    });

    it('precomputes with compile-time known vectors', () => {
      const foo = tgpu.fn([], d.vec3b)(() => not(d.vec3b(false, true, false)));

      expect(parseResolved({ foo })).toEqual(parse(`
        fn foo() -> vec3<bool> { return vec3<bool>(true, false, true); }
      `));
    });
  });

  describe('in tgsl (runtime-time known)', () => {
    it('resolves to ! expression', () => {
      const foo = tgpu.fn([d.bool], d.bool)((arg) => !arg);

      expect(parseResolved({ foo })).toEqual(parse(`
        fn foo(arg: bool) -> bool { return !arg; }
      `));
    });
  });
});
