import { describe, expect, expectTypeOf } from 'vitest';
import { it } from 'typegpu-testing-utility';
import { tgpu, d } from 'typegpu';

describe('rawCodeSnippet', () => {
  it('should throw a descriptive error when called in JS', () => {
    const rawSnippet = tgpu['~unstable'].rawCodeSnippet('3', d.f32);

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return rawSnippet.$;
    });

    expect(() => myFn()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:myFn: Raw code snippets can only be used on the GPU.]
    `);
  });

  it('should properly inline', () => {
    const rawSnippet = tgpu['~unstable'].rawCodeSnippet('3f', d.f32);

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      return rawSnippet.$;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 3f;
      }"
    `);
  });

  it('should use the origin', () => {
    const rawSnippet = tgpu['~unstable'].rawCodeSnippet('3f', d.f32, 'constant');

    const myFn = tgpu.fn(
      [],
      d.f32,
    )(() => {
      const a = rawSnippet.$; // should resolve to 'const' instead of 'let'
      return a;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        const a = 3f;
        return a;
      }"
    `);
  });

  it('should properly resolve dependencies', ({ root }) => {
    const myBuffer = root.createUniform(d.u32, 7);

    const rawSnippet = tgpu['~unstable']
      .rawCodeSnippet('myBuffer', d.u32, 'uniform')
      .$uses({ myBuffer });

    const myFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      return rawSnippet.$;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> myBuffer: u32;

      fn myFn() -> u32 {
        return myBuffer;
      }"
    `);
  });

  it('should properly resolve layout dependencies', ({ root }) => {
    const myLayout = tgpu.bindGroupLayout({ myBuffer: { uniform: d.u32 } });

    const rawSnippet = tgpu['~unstable']
      .rawCodeSnippet('myLayout.$.myBuffer', d.u32, 'uniform')
      .$uses({ myLayout });

    const myFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      return rawSnippet.$;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> myBuffer: u32;

      fn myFn() -> u32 {
        return myBuffer;
      }"
    `);
  });

  it('should not duplicate dependencies', ({ root }) => {
    const myBuffer = root.createUniform(d.u32, 7);

    const rawSnippet = tgpu['~unstable']
      .rawCodeSnippet('myBuffer', d.u32, 'uniform')
      .$uses({ myBuffer });

    const myFn = tgpu.fn(
      [],
      d.u32,
    )(() => {
      return myBuffer.$ + rawSnippet.$;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> myBuffer: u32;

      fn myFn() -> u32 {
        return (myBuffer + myBuffer);
      }"
    `);
  });

  it("throws when '$uses' is called multiple times", ({ root }) => {
    const myBuffer = root.createUniform(d.u32, 7);

    const rawSnippet = tgpu['~unstable']
      .rawCodeSnippet('myBuffer', d.u32, 'uniform')
      .$uses({ myBuffer });

    expect(() => rawSnippet.$uses({ myBuffer })).toThrowErrorMatchingInlineSnapshot(
      `[Error: Cannot call '$uses' multiple times. If you wish to override dependencies, use slots or accessors instead.]`,
    );
  });

  it('should be accessed transitively through a slot', () => {
    const exprSlot = tgpu.slot(tgpu['~unstable'].rawCodeSnippet('0.5 + 0.2', d.f32, 'constant'));

    const foo = () => {
      'use gpu';
      return exprSlot.$;
    };

    expectTypeOf<typeof exprSlot.$>().toEqualTypeOf<number>();
    expect(tgpu.resolve([foo])).toMatchInlineSnapshot(`
      "fn foo() -> f32 {
        return 0.5 + 0.2;
      }"
    `);
  });

  it('should rename references to local variables when they have been renamed in the owner function', () => {
    const constant = tgpu.const(d.f32, 123).$name('a');

    // `a` refers to the nearest definition, in this case, the argument of each respective function
    const snippet = tgpu['~unstable'].rawCodeSnippet('a * 2 + constant', d.f32).$uses({ constant });

    const wgslFn = tgpu.fn([d.f32], d.f32)`(a) {
      return snippet;
    }`.$uses({ snippet });

    const jsFn = tgpu.fn(
      [d.f32],
      d.f32,
    )((a) => {
      'use gpu';
      return snippet.$;
    });

    const main = () => {
      'use gpu';
      const first = constant.$;
      return first + (jsFn(2) + wgslFn(1));
    };

    expect(tgpu.resolve([main])).toMatchInlineSnapshot(`
      "const a: f32 = 123f;

      fn jsFn(a_1: f32) -> f32 {
        return a * 2 + a;
      }

      fn wgslFn(a_1: f32) -> f32 {
            return a_1 * 2 + a;
          }

      fn main() -> f32 {
        const first = a;
        return (first + (jsFn(2f) + wgslFn(1f)));
      }"
    `);
  });
});
