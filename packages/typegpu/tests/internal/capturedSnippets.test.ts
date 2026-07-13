import { describe, expect } from 'vitest';
import { tgpu, d } from 'typegpu';
import { CAPTURE, captureSnippets, it, simplifyType } from 'typegpu-testing-utility';

describe('CAPTURE', () => {
  it('is a no-op in regular resolves', () => {
    const fn = tgpu.fn([d.u32])((x) => {
      'use gpu';
      const a = CAPTURE(1 + 2);
      const b = CAPTURE(a + 1);
      const c = CAPTURE(x);
      const d = CAPTURE(CAPTURE(1));
    });

    expect(tgpu.resolve([fn])).toMatchInlineSnapshot(`
      "fn fn_1(x: u32) {
        const a = 3;
        let b = (a + 1i);
        let c = x;
        const d = 1;
      }"
    `);
  });

  it('allows snippet extraction', () => {
    const fn = tgpu.fn([d.u32])((x) => {
      'use gpu';
      const a = CAPTURE(1 + 2);
      const b = CAPTURE(a + 1);
      const c = CAPTURE(x);
      const d = CAPTURE(CAPTURE(1) + (c + x));
    });

    expect(captureSnippets(fn).map(simplifyType)).toMatchInlineSnapshot(`
      [
        {
          "dataType": "abstractInt",
          "origin": "constant",
          "possibleSideEffects": true,
          "value": 3,
        },
        {
          "dataType": "i32",
          "origin": "runtime",
          "possibleSideEffects": false,
          "value": "(a + 1i)",
        },
        {
          "dataType": "u32",
          "origin": "argument",
          "possibleSideEffects": false,
          "value": "x",
        },
        {
          "dataType": "abstractInt",
          "origin": "constant",
          "possibleSideEffects": false,
          "value": 1,
        },
        {
          "dataType": "u32",
          "origin": "runtime",
          "possibleSideEffects": false,
          "value": "(1u + (c + x))",
        },
      ]
    `);
  });

  it('recaptures when called a second time', () => {
    let count = 0;
    const lazy = tgpu.lazy(() => count++);
    const fn = () => {
      'use gpu';
      return CAPTURE(lazy.$);
    };

    expect(captureSnippets(fn)[0]?.value).toBe(0);
    expect(captureSnippets(fn)[0]?.value).toBe(1);
    expect(captureSnippets(fn)[0]?.value).toBe(2);
  });

  it('captures inner to outer', () => {
    const fn = () => {
      'use gpu';
      return CAPTURE(CAPTURE(1) + 2);
    };

    const captured = captureSnippets(fn);
    expect(captured[0]?.value).toBe(1);
    expect(captured[1]?.value).toBe(3);
  });
});
