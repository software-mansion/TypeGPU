import { describe, expect, it } from 'vitest';
import {
  createDualImpl,
  dualImpl,
  NotImplementedError,
} from '../../src/core/function/dualImpl.ts';
import { getName } from '../../src/shared/meta.ts';
import { Void } from '../../src/data/wgslTypes.ts';
import tgpu from '../../src/index.ts';
import { asWgsl } from '../utils/parseResolved.ts';

describe('createDualImpl', () => {
  it('names functions created by createDualImpl', () => {
    const dual = createDualImpl((a) => a, (snippet) => snippet, 'myDualImpl');
    expect(getName(dual)).toBe('myDualImpl');
  });
});

describe('dualImpl', () => {
  it('names functions created by dualImpl', () => {
    const dual = dualImpl({
      normalImpl: () => {},
      signature: () => ({ argTypes: [], returnType: Void }),
      codegenImpl: () => 'code',
      name: 'myDualImpl',
    });
    expect(getName(dual)).toBe('myDualImpl');
  });

  it('inlines results when possible', () => {
    const dual = dualImpl({
      normalImpl: (a: number) => a + 3,
      signature: (snippet) => ({ argTypes: [snippet], returnType: snippet }),
      codegenImpl: (snippet) => `(${snippet.value} + 3)`,
      name: 'myDualImpl',
    });

    const myFn = tgpu.fn([])(() => {
      const a = dual(2);
    });

    expect(asWgsl(myFn)).toMatchInlineSnapshot(`
      "fn myFn() {
        var a = 5;
      }"
    `);
  });

  it('fallbacks to codegenImpl', () => {
    const dual = dualImpl({
      normalImpl: (a: number) => {
        throw new NotImplementedError('Not implemented yet.');
      },
      signature: (snippet) => ({ argTypes: [snippet], returnType: snippet }),
      codegenImpl: (snippet) => `fallback(${snippet.value})`,
      name: 'myDualImpl',
    });

    const myFn = tgpu.fn([])(() => {
      const a = dual(2);
    });

    expect(asWgsl(myFn)).toMatchInlineSnapshot(`
      "fn myFn() {
        var a = fallback(2);
      }"
    `);
  });

  it('rethrows errors other than NotImplementedError', () => {
    const dual = dualImpl({
      normalImpl: (a: number) => {
        if (a === 0) throw new Error('Division by zero');
        return 1 / a;
      },
      signature: (snippet) => ({ argTypes: [snippet], returnType: snippet }),
      codegenImpl: (snippet) => `(1 / ${snippet.value})`,
      name: 'myDualImpl',
    });

    const myFn = tgpu.fn([])(() => {
      const a = dual(0);
    });

    expect(() => asWgsl(myFn)).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn
      - myDualImpl: Division by zero]
    `);
  });
});
