import { describe, expect, it } from 'vitest';
import tgpu, { d } from '../src/index.js';

describe('Math', () => {
  it('allows using Math.PI', () => {
    const myFn = () => {
      'use gpu';
      const a = Math.PI;
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        const a = 3.141592653589793;
      }"
    `);
  });

  it('allows using Math.sin', () => {
    const myFn = () => {
      'use gpu';
      const a = 0.5;
      const b = Math.sin(a);
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        const a = 0.5;
        let b = sin(a);
      }"
    `);
  });

  it('precomputes Math.sin when applicable', () => {
    const myFn = () => {
      'use gpu';
      const a = Math.sin(0.5);
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        const a = 0.479425538604203;
      }"
    `);
  });

  it('coerces Math.sin arguments', () => {
    const myFn = () => {
      'use gpu';
      const a = d.u32();
      const b = Math.sin(a);
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        const a = 0u;
        let b = sin(f32(a));
      }"
    `);
  });

  it('allows Math.min to accept multiple arguments', () => {
    const myFn = () => {
      'use gpu';
      const a = d.u32();
      const b = Math.min(a, 1, 2, 3);
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        const a = 0u;
        let b = min(min(min(a, 1u), 2u), 3u);
      }"
    `);
  });

  it('throws a readable error when unsupported Math feature is used', () => {
    const myFn = () => {
      'use gpu';
      const a = Math.log1p(1);
    };

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn*:myFn
      - fn*:myFn(): Unsupported functionality 'Math.log1p'. Use an std alternative, or implement the function manually.]
    `);
  });

  it('correctly applies Math.fround', () => {
    const myFn = () => {
      'use gpu';
      const a = Math.fround(16777217);
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        const a = 16777216f;
      }"
    `);
  });
});
