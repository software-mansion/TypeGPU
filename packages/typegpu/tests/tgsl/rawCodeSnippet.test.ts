import { describe, expect, expectTypeOf } from 'vitest';
import { it } from '../utils/extendedIt.ts';
import tgpu, { d } from '../../src/index.js';

describe('rawCodeSnippet', () => {
  it('should throw a descriptive error when called in JS', () => {
    const rawSnippet = tgpu['~unstable'].rawCodeSnippet('3', d.f32);

    const myFn = tgpu.fn([], d.f32)(() => {
      return rawSnippet.$;
    });

    expect(() => myFn()).toThrowErrorMatchingInlineSnapshot(`
      [Error: Execution of the following tree failed:
      - fn:myFn: Raw code snippets can only be used on the GPU.]
    `);
  });

  it('should properly inline', () => {
    const rawSnippet = tgpu['~unstable'].rawCodeSnippet('3f', d.f32);

    const myFn = tgpu.fn([], d.f32)(() => {
      return rawSnippet.$;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() -> f32 {
        return 3f;
      }"
    `);
  });

  it('should use the origin', () => {
    const rawSnippet = tgpu['~unstable'].rawCodeSnippet(
      '3f',
      d.f32,
      'constant',
    );

    const myFn = tgpu.fn([], d.f32)(() => {
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

    const rawSnippet = tgpu['~unstable'].rawCodeSnippet(
      'myBuffer',
      d.u32,
      'uniform',
    ).$uses({ myBuffer });

    const myFn = tgpu.fn([], d.u32)(() => {
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

    const rawSnippet = tgpu['~unstable'].rawCodeSnippet(
      'myLayout.$.myBuffer',
      d.u32,
      'uniform',
    ).$uses({ myLayout });

    const myFn = tgpu.fn([], d.u32)(() => {
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

    const rawSnippet = tgpu['~unstable'].rawCodeSnippet(
      'myBuffer',
      d.u32,
      'uniform',
    ).$uses({ myBuffer });

    const myFn = tgpu.fn([], d.u32)(() => {
      return myBuffer.$ + rawSnippet.$;
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "@group(0) @binding(0) var<uniform> myBuffer: u32;

      fn myFn() -> u32 {
        return (myBuffer + myBuffer);
      }"
    `);
  });

  it('should be accessed transitively through a slot', () => {
    const exprSlot = tgpu.slot(
      tgpu['~unstable'].rawCodeSnippet('0.5 + 0.2', d.f32, 'constant'),
    );

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
});
