import { describe, expect, it, vi } from 'vitest';
import { d, writeToArrayBuffer } from 'typegpu';

vi.mock('../src/data/compiledIO.ts', () => ({
  EVAL_ALLOWED_IN_ENV: false,
  getCompiledWriter: () => undefined,
  buildWriter: () => '',
}));

describe('audit data regressions without eval', () => {
  it('B21: a flat mat3 input receives WGSL column padding', () => {
    const buffer = new ArrayBuffer(48);
    writeToArrayBuffer(buffer, d.mat3x3f, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect([...new Float32Array(buffer)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  });

  it('B22: endOffset prevents writes to the following struct member', () => {
    const schema = d.struct({ a: d.u32, b: d.u32 });
    const buffer = new Uint32Array([7, 8]).buffer;
    writeToArrayBuffer(buffer, schema, { a: 1, b: 2 }, { endOffset: 4 });
    expect([...new Uint32Array(buffer)]).toEqual([1, 8]);
  });

  it('B59: a nested struct uses its packed offset in the fallback writer', () => {
    const schema = d.unstruct({ prefix: d.f32, nested: d.struct({ value: d.vec4f }) });
    const buffer = new ArrayBuffer(d.sizeOf(schema));
    writeToArrayBuffer(buffer, schema, { prefix: 7, nested: { value: d.vec4f(1, 2, 3, 4) } });
    expect([...new Float32Array(buffer)]).toEqual([7, 1, 2, 3, 4]);
  });

  it('B62: normalized formats round halfway values consistently with the compiled writer', () => {
    const unorm16 = new ArrayBuffer(4);
    writeToArrayBuffer(unorm16, d.unorm16x2, d.vec2f(0.5));
    expect.soft([...new Uint16Array(unorm16)]).toEqual([32768, 32768]);
    const bgra8 = new ArrayBuffer(4);
    writeToArrayBuffer(bgra8, d.unorm8x4_bgra, d.vec4f(0.5));
    expect([...new Uint8Array(bgra8)]).toEqual([128, 128, 128, 128]);
  });
});
