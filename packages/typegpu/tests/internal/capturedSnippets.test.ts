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
});
