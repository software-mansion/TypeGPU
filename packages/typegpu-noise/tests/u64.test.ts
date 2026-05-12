import { describe, expect, it } from 'vitest';
import tgpu from 'typegpu';
import { u64Add, u64Mul } from '../src/utils.ts';

describe('u64 arithmetic', () => {
  it('u64Add resolves to correct WGSL', () => {
    expect(tgpu.resolve([u64Add])).toMatchInlineSnapshot(`
      "fn u64Add(a: vec2u, b: vec2u) -> vec2u {
        let rl = (a.x + b.x);
        let carry = u32(((rl < a.x) && (rl < b.x)));
        let rh = ((a.y + b.y) + carry);
        return vec2u(rl, rh);
      }"
    `);
  });

  it('u64Mul resolves to correct WGSL', () => {
    expect(tgpu.resolve([u64Mul])).toMatchInlineSnapshot(`
      "fn u64Mul(a: vec2u, b: vec2u) -> vec2u {
        let all_1 = (a.x & 65535u);
        let alh = (a.x >> 16u);
        let ahl = (a.y & 65535u);
        let ahh = (a.y >> 16u);
        let bll = (b.x & 65535u);
        let blh = (b.x >> 16u);
        let bhl = (b.y & 65535u);
        let bhh = (b.y >> 16u);
        let row0_0 = (bll * all_1);
        let row0_1 = (bll * alh);
        let row0_2 = (bll * ahl);
        let row0_3 = (bll * ahh);
        let row1_0 = (blh * all_1);
        let row1_1 = (blh * alh);
        let row1_2 = (blh * ahl);
        let row2_0 = (bhl * all_1);
        let row2_1 = (bhl * alh);
        let row3_0 = (bhh * all_1);
        let r1 = (row0_0 & 65535u);
        var r2 = (((row0_0 >> 16u) + (row0_1 & 65535u)) + (row1_0 & 65535u));
        var r3 = (((((row0_1 >> 16u) + (row0_2 & 65535u)) + (row1_0 >> 16u)) + (row1_1 & 65535u)) + (row2_0 & 65535u));
        var r4 = (((((((row0_2 >> 16u) + (row0_3 & 65535u)) + (row1_1 >> 16u)) + (row1_2 & 65535u)) + (row2_0 >> 16u)) + (row2_1 & 65535u)) + (row3_0 & 65535u));
        r3 += (r2 >> 16u);
        r2 &= 65535u;
        r4 += (r3 >> 16u);
        r3 &= 65535u;
        r4 &= 65535u;
        return vec2u((r1 | (r2 << 16u)), (r3 | (r4 << 16u)));
      }"
    `);
  });
});
