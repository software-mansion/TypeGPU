import { describe, expect, it } from 'vitest';
import tgpu, { d } from '../src/index.ts';

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
      const a = 0;
      const b = Math.sin(a);
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot();
  });

  it('precomputes Math.sin when applicable', () => {
    const myFn = () => {
      'use gpu';
      const a = Math.sin(0);
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot();
  });

  it('coerces Math.sin arguments', () => {
    const myFn = () => {
      'use gpu';
      const a = d.u32();
      const b = Math.sin(a);
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot();
  });

  it('allows Math.max to accept multiple arguments', () => {
    const myFn = () => {
      'use gpu';
      const a = d.u32();
      const b = Math.max(a, 1, 2, 3);
    };

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot();
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
      - fn*:myFn(): Function 'function log1p() { [native code] }' is not marked with the 'use gpu' directive and cannot be used in a shader]
    `);
  });
});
