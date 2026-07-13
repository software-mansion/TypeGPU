// TODO(#2659): Move out of /internal once `getName` is available through 'typegpu/~internal'
import { describe, expect } from 'vitest';
import { struct } from 'typegpu/data';
import { getName } from '../../src/shared/meta.ts';
import { tgpu, d, type TgpuBindGroupLayout } from 'typegpu';
import { CAPTURE, captureSnippets, it } from 'typegpu-testing-utility';

describe('...', () => {
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

    expect(captureSnippets(fn)).toMatchInlineSnapshot(`
      [
        SnippetImpl {
          "dataType": {
            "concretized": [Function],
            "toString": [Function],
            "type": "abstractInt",
            Symbol(typegpu:0.11.9:$internal): {},
          },
          "origin": "constant",
          "possibleSideEffects": true,
          "value": 3,
        },
        SnippetImpl {
          "dataType": [Function],
          "origin": "runtime",
          "possibleSideEffects": false,
          "value": "(a + 1i)",
        },
        SnippetImpl {
          "dataType": [Function],
          "origin": "argument",
          "possibleSideEffects": false,
          "value": "x",
        },
        SnippetImpl {
          "dataType": {
            "concretized": [Function],
            "toString": [Function],
            "type": "abstractInt",
            Symbol(typegpu:0.11.9:$internal): {},
          },
          "origin": "constant",
          "possibleSideEffects": false,
          "value": 1,
        },
        SnippetImpl {
          "dataType": [Function],
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
});
