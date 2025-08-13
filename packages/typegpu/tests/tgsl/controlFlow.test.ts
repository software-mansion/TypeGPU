import tgpu from '../../src/index.ts';
import * as d from '../../src/data/index.ts';
import { it } from '../utils/extendedIt.ts';
import { describe, expect } from 'vitest';
import { parse, parseResolved } from '../utils/parseResolved.ts';

describe('if statement', () => {
  it('generates correct code for conditional with single statement', () => {
    const main0 = tgpu.fn([d.bool], d.u32)((cond) => {
      if (cond) return 0;
      return 1;
    });

    expect(parseResolved({ main0 })).toBe(
      parse(`
    fn main0(cond: bool) -> u32 {
      if (cond) {
        return 0;
      }
      return 1;
    }`),
    );
  });

  it('generates correct code for conditional with else', () => {
    const main1 = tgpu.fn([d.bool], d.i32)((cond) => {
      let y = 0;
      if (cond) y = 1;
      else y = 2;
      return y;
    });

    expect(parseResolved({ main1 })).toBe(
      parse(`
    fn main1(cond: bool) -> i32 {
      var y = 0;
      if (cond) {
        y = 1;
      } else {
       y = 2;
      }
      return y;
    }`),
    );
  });

  it('generates correct code for conditionals block', () => {
    const main2 = tgpu.fn([d.bool], d.i32)((cond) => {
      let y = 0;
      if (cond) {
        y = 1;
      } else y = 2;
      return y;
    });

    expect(parseResolved({ main2 })).toBe(
      parse(`
    fn main2(cond: bool) -> i32 {
      var y = 0;
      if (cond) {
        y = 1;
      } else {
       y = 2;
      }
      return y;
    }`),
    );
  });

  it('works with boolean literals', () => {
    const foo = tgpu.fn([], d.f32)(() => {
      let value = d.f32(0);

      // biome-ignore lint/correctness/noConstantCondition: just a test
      if (true) value = 1;
      else value = 2;

      // biome-ignore lint/correctness/noConstantCondition: just a test
      if (false) value = 3;
      else value = 4;

      // biome-ignore lint/correctness/noConstantCondition: just a test
      if (false) value = 5;
      // biome-ignore lint/correctness/noConstantCondition: just a test
      if (true) value = 6;

      return value;
    });

    expect(parseResolved({ foo })).toEqual(parse(`
      fn foo() -> f32 {
        var value = f32(0);

        { value = 1; }
        { value = 4; }
        { value = 6; }

        return value;
      }
    `));
  });

  it('works with slots', () => {
    const condSlot = tgpu.slot(true);
    const foo = tgpu.fn([], d.f32)(() => {
      if (condSlot.$) return 1;
      // biome-ignore lint/style/noUselessElse: just a test
      else return 0;
    });

    const fooTrue = foo.with(condSlot, true);
    const fooFalse = foo.with(condSlot, false);

    expect(parseResolved({ fooTrue, fooFalse })).toEqual(parse(`
      fn foo() -> f32 {
        { return 1; }
      }

      fn foo_1() -> f32 {
        { return 0; }
      }
    `));
  });

  it('works with runtime-known conditions', () => {
    const foo = tgpu.fn([d.bool], d.f32)((cond) => {
      if (cond) return 1;
      // biome-ignore lint/style/noUselessElse: just a test
      else return 0;
    });

    expect(parseResolved({ foo })).toEqual(parse(`
      fn foo(cond: bool) -> f32 {
        if (cond) { return 1; }
        else { return 0; }
      }
    `));
  });
});

describe('for statement', () => {
  it('generates correct code for for loops with single statements', () => {
    const main = tgpu.fn([])(() => {
      // biome-ignore lint/correctness/noUnnecessaryContinue: sshhhh, it's just a test
      for (let i = 0; i < 10; i += 1) continue;
    });

    expect(parseResolved({ main })).toBe(parse(`
      fn main() {
        for (var i = 0; (i < 10); i += 1) {
          continue;
        }
      }
    `));
  });
});

describe('while statement', () => {
  it('generates correct code for while loops with single statements', () => {
    const main = tgpu.fn([])(() => {
      let i = 0;
      while (i < 10) i += 1;
    });

    expect(parseResolved({ main })).toBe(parse(`
      fn main () {
        var i = 0;
        while((i < 10)) {
          i += 1;
        }
      }`));
  });
});
