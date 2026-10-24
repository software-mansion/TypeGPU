import { describe, expect, vi } from 'vitest';
import { d, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

// gets hoisted before imports
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

  it('does not override 4th element when handling vec3f', () => {
    const buffer = new ArrayBuffer(16);
    writeToArrayBuffer(buffer, d.vec4f, [1, 2, 3, 4]);

    writeToArrayBuffer(buffer, d.vec3f, [6, 7, 8]);

    expect([...new Float32Array(buffer)]).toEqual([6, 7, 8, 4]);
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

  it('handles mat3x3f with float32Array input', () => {
    const buffer = new ArrayBuffer(48);

    writeToArrayBuffer(buffer, d.mat3x3f, new Float32Array([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]));

    expect([...new Float32Array(buffer)]).toEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  });

  it('overrides all values when handling mat3x3f', () => {
    const buffer = new ArrayBuffer(48);
    writeToArrayBuffer(
      buffer,
      d.arrayOf(d.u32, 12),
      [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    );

    writeToArrayBuffer(buffer, d.mat3x3f, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

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

  describe('with nested custom alignment', () => {
    const AlignedFromFirstField = d.unstruct({ x: d.align(16, d.f32) });
    const AlignedFromNestedFirstField = d.unstruct({ inner: AlignedFromFirstField, y: d.f32 });
    const LocallyAligned = d.unstruct({ a: d.f32, b: d.align(16, d.f32) });

    it('pads elements to the custom alignment of a nested unstruct', () => {
      const TestArray = d.disarrayOf(AlignedFromNestedFirstField, 2);
      const buffer = new ArrayBuffer(d.sizeOf(TestArray));

      writeToArrayBuffer(buffer, TestArray, [
        { inner: { x: 1 }, y: 2 },
        { inner: { x: 3 }, y: 4 },
      ]);

      expect([...new Float32Array(buffer)]).toStrictEqual([1, 2, 0, 0, 3, 4, 0, 0]);
    });

    it('places non-first aligned fields relative to the element', () => {
      const TestArray = d.disarrayOf(LocallyAligned, 2);
      const buffer = new ArrayBuffer(d.sizeOf(TestArray));

      writeToArrayBuffer(buffer, TestArray, [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ]);

      expect([...new Float32Array(buffer)]).toStrictEqual([1, 0, 0, 0, 2, 3, 0, 0, 0, 4]);
    });

    it('introduces padding before a disarray nested in an unstruct', () => {
      const Outer = d.unstruct({ a: d.f32, b: d.disarrayOf(AlignedFromFirstField, 2), c: d.f32 });
      const buffer = new ArrayBuffer(d.sizeOf(Outer));

      writeToArrayBuffer(buffer, Outer, { a: 1, b: [{ x: 2 }, { x: 3 }], c: 4 });

      expect([...new Float32Array(buffer)]).toStrictEqual([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4]);
    });

    it('does not align wgsl structs packed into an unstruct', () => {
      const Outer = d.unstruct({ a: d.u32, s: d.struct({ v: d.vec3u, w: d.u32 }) });
      const buffer = new ArrayBuffer(d.sizeOf(Outer));

      writeToArrayBuffer(buffer, Outer, { a: 1, s: { v: d.vec3u(2, 3, 4), w: 5 } });

      expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4, 5]);
    });
  });
});
