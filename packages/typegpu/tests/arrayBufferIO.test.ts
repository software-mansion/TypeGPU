import { describe, expect } from 'vitest';
import { d, patchArrayBuffer, readFromArrayBuffer, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('arrayBufferIO', () => {
  describe('write', () => {
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
  });

  describe('read', () => {
    it('handles vectors', () => {
      const buffer = new ArrayBuffer(16);
      writeToArrayBuffer(buffer, d.vec4u, d.vec4u(1, 2, 3, 4));

      const result = readFromArrayBuffer(buffer, d.vec4u);

      expect(result).toStrictEqual(d.vec4u(1, 2, 3, 4));
    });

    it('handles structs', () => {
      const buffer = new ArrayBuffer(32);
      const Boid = d.struct({ pos: d.vec2u, id: d.u32 });
      const Boids = d.arrayOf(Boid, 2);
      const boids = [Boid({ pos: d.vec2u(1, 2), id: 3 }), Boid({ pos: d.vec2u(4, 5), id: 6 })];
      writeToArrayBuffer(buffer, Boids, boids);

      const results = readFromArrayBuffer(buffer, Boids);

      expect(results).toStrictEqual(boids);
    });
  });

  describe('patch', () => {
    it('works', () => {
      const buffer = new ArrayBuffer(8);
      const Struct = d.struct({ a: d.u32, b: d.u32 });
      writeToArrayBuffer(buffer, Struct, { a: 1, b: 2 });

      patchArrayBuffer(buffer, Struct, { b: 99 });

      const result = readFromArrayBuffer(buffer, Struct);
      expect(result).toStrictEqual({ a: 1, b: 99 });
    });
  });
});
