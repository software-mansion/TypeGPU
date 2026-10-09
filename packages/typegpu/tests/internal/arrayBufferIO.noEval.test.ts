import { describe, expect, vi } from 'vitest';
import { d, patchArrayBuffer, readFromArrayBuffer, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

vi.mock('../../src/data/compiledIO.ts', () => ({
  EVAL_ALLOWED_IN_ENV: false,
  getCompiledWriter: () => undefined,
  buildWriter: () => '',
}));

describe('arrayBufferIO', () => {
  it('handles d.vec input', () => {
    const buffer = new ArrayBuffer(16);

    writeToArrayBuffer(buffer, d.vec4u, d.vec4u(1, 2, 3, 4));

    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4]);
  });

  it('handles plain array input', () => {
    const buffer = new ArrayBuffer(16);

    writeToArrayBuffer(buffer, d.vec4u, [1, 2, 3, 4]);

    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4]);
  });

  it('handles typed array input', () => {
    const buffer = new ArrayBuffer(16);

    writeToArrayBuffer(buffer, d.vec4u, new Uint32Array([1, 2, 3, 4]));

    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4]);
  });

  it('handles ArrayBuffer input', () => {
    const buffer = new ArrayBuffer(16);

    writeToArrayBuffer(buffer, d.vec4u, new Uint32Array([1, 2, 3, 4]).buffer);

    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4]);
  });

  it('respects startOffset', () => {
    const buffer = new Uint32Array([10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10]);
    const Numbers = d.arrayOf(d.u32, 12);
    const layout = d.memoryLayoutOf(Numbers, (a) => a[4]);

    writeToArrayBuffer(buffer.buffer, Numbers, [1, 2, 3, 4], { startOffset: layout.offset });

    expect([...new Uint32Array(buffer)]).toStrictEqual([
      10, 10, 10, 10, 1, 2, 3, 4, 10, 10, 10, 10,
    ]);
  });

  it('handles structs', () => {
    const buffer = new ArrayBuffer(32);
    const Boid = d.struct({ pos: d.vec2u, id: d.u32 });
    const Boids = d.arrayOf(Boid, 2);

    writeToArrayBuffer(buffer, Boids, [
      Boid({ pos: d.vec2u(1, 2), id: 3 }),
      Boid({ pos: d.vec2u(4, 5), id: 6 }),
    ]);

    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 0, 4, 5, 6, 0]);
  });

  it('handles vec3f', () => {
    const buffer = new ArrayBuffer(16);

    writeToArrayBuffer(buffer, d.vec3f, [1, 2, 3]);

    expect([...new Float32Array(buffer)]).toEqual([1, 2, 3, 0]);
  });

  it('handles mat3x3f with array input', () => {
    const buffer = new ArrayBuffer(48);

    writeToArrayBuffer(buffer, d.mat3x3f, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

    expect([...new Float32Array(buffer)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  });

  it('handles mat3x3f with matrix input', () => {
    const buffer = new ArrayBuffer(48);

    writeToArrayBuffer(buffer, d.mat3x3f, d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9));

    expect([...new Float32Array(buffer)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  });

  it('handles structs with attributes', () => {
    const buffer = new ArrayBuffer(64);
    const Boid = d.struct({ pos: d.vec2u, id: d.align(16, d.u32) });
    const Boids = d.arrayOf(Boid, 2);

    writeToArrayBuffer(buffer, Boids, [
      Boid({ pos: d.vec2u(1, 2), id: 3 }),
      Boid({ pos: d.vec2u(4, 5), id: 6 }),
    ]);

    expect([...new Uint32Array(buffer)]).toStrictEqual([
      1, 2, 0, 0, 3, 0, 0, 0, 4, 5, 0, 0, 6, 0, 0, 0,
    ]);
  });
});
