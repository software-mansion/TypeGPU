import { describe, expect, it } from 'vitest';
import {
  dualImpl,
  MissingCpuImplError,
} from '../../src/core/function/dualImpl.ts';
import { Void } from '../../src/data/wgslTypes.ts';
import tgpu from '../../src/index.js';
import { getName } from '../../src/shared/meta.ts';

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
      codegenImpl: (_ctx, [snippet]) => `(${snippet.value} + 3)`,
      name: 'myDualImpl',
    });

    const myFn = tgpu.fn([])(() => {
      const a = dual(2);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        const a = 5;
      }"
    `);
  });

  it('throws on missing cpuImpl in cpu mode', () => {
    const dual = dualImpl<(a: number) => number>({
      normalImpl: 'Not implemented yet.',
      signature: (snippet) => ({ argTypes: [snippet], returnType: snippet }),
      codegenImpl: (_ctx, [snippet]) => `fallback(${snippet.value})`,
      name: 'myDualImpl',
    });

    expect(() => dual(2)).toThrowErrorMatchingInlineSnapshot(
      '[MissingCpuImplError: Not implemented yet.]',
    );
  });

  it('fallbacks to codegenImpl on missing cpuImpl', () => {
    const f = (a: number) => {
      throw new MissingCpuImplError('Not implemented yet.');
    };

    const dual = dualImpl<typeof f>({
      normalImpl: 'Not implemented yet.',
      signature: (snippet) => ({ argTypes: [snippet], returnType: snippet }),
      codegenImpl: (_ctx, [snippet]) => `fallback(${snippet.value})`,
      name: 'myDualImpl',
    });

    const myFn = tgpu.fn([])(() => {
      const a = dual(2);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        let a = fallback(2);
      }"
    `);
  });

  it('fallbacks to codegenImpl on error', () => {
    const dual = dualImpl({
      normalImpl: (a: number) => {
        throw new MissingCpuImplError('Not implemented yet.');
      },
      signature: (snippet) => ({ argTypes: [snippet], returnType: snippet }),
      codegenImpl: (_ctx, [snippet]) => `fallback(${snippet.value})`,
      name: 'myDualImpl',
    });

    const myFn = tgpu.fn([])(() => {
      const a = dual(2);
    });

    expect(tgpu.resolve([myFn])).toMatchInlineSnapshot(`
      "fn myFn() {
        let a = fallback(2);
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
      codegenImpl: (_ctx, [snippet]) => `(1 / ${snippet.value})`,
      name: 'myDualImpl',
    });

    const myFn = tgpu.fn([])(() => {
      const a = dual(0);
    });

    expect(() => tgpu.resolve([myFn])).toThrowErrorMatchingInlineSnapshot(`
      [Error: Resolution of the following tree failed:
      - <root>
      - fn:myFn
      - fn:myDualImpl: Division by zero]
    `);
  });
});
