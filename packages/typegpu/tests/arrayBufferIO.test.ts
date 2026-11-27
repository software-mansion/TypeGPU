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

    it('handles mat3x3f', () => {
      const buffer = new ArrayBuffer(48);

      writeToArrayBuffer(buffer, d.mat3x3f, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

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

    it('expects a particular number of elements for vectors and matrices', () => {
      const buffer = new ArrayBuffer(48);

      // @ts-expect-error
      () => writeToArrayBuffer(buffer, d.vec3f, [1, 2, 3, 4]);

      // @ts-expect-error
      () => writeToArrayBuffer(buffer, d.mat3x3f, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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

    it('throws for sparse indices past the end of an array', () => {
      const Struct = d.struct({ a: d.arrayOf(d.u32, 2), b: d.u32 });
      const buffer = new ArrayBuffer(d.sizeOf(Struct));
      writeToArrayBuffer(buffer, Struct, { a: [1, 2], b: 3 });

      expect(() => patchArrayBuffer(buffer, Struct, { a: { 2: 99 } })).toThrow(
        'Index 2 is out of bounds for an array of 2 elements.',
      );
      expect(readFromArrayBuffer(buffer, Struct)).toStrictEqual({ a: [1, 2], b: 3 });
    });

    it('throws for negative or fractional sparse indices', () => {
      const Struct = d.struct({ b: d.u32, a: d.arrayOf(d.u32, 2) });
      const buffer = new ArrayBuffer(d.sizeOf(Struct));
      writeToArrayBuffer(buffer, Struct, { b: 3, a: [1, 2] });

      expect(() => patchArrayBuffer(buffer, Struct, { a: { [-1]: 99 } })).toThrow(
        'Index -1 is out of bounds for an array of 2 elements.',
      );
      expect(() => patchArrayBuffer(buffer, Struct, { a: { 0.5: 99 } })).toThrow(
        'Index 0.5 is out of bounds for an array of 2 elements.',
      );
      expect(readFromArrayBuffer(buffer, Struct)).toStrictEqual({ b: 3, a: [1, 2] });
    });

    it('throws for keys that are not written like an index', () => {
      const Schema = d.arrayOf(d.u32, 2);
      const buffer = new ArrayBuffer(d.sizeOf(Schema));
      writeToArrayBuffer(buffer, Schema, [1, 2]);

      for (const key of ['', '0x1', ' 1', '1e0', '-0', 'foo']) {
        // A computed key gets past the types
        expect(() => patchArrayBuffer(buffer, Schema, { 1: 9, [key]: 9 })).toThrow(
          `'${key}' is not a valid array index.`,
        );
      }
      expect(readFromArrayBuffer(buffer, Schema)).toStrictEqual([1, 2]);
    });

    it('bounds sparse indices of runtime-sized arrays by the size of the buffer', () => {
      const Schema = d.arrayOf(d.u32, 0);
      const buffer = new ArrayBuffer(12);

      patchArrayBuffer(buffer, Schema, { 2: 7 });
      expect([...new Uint32Array(buffer)]).toStrictEqual([0, 0, 7]);

      expect(() => patchArrayBuffer(buffer, Schema, { 3: 7 })).toThrow(
        'Index 3 is out of bounds for an array of 3 elements.',
      );
    });

    it('does not bound empty disarrays by the size of the buffer', () => {
      const Schema = d.unstruct({ a: d.disarrayOf(d.u32, 0), b: d.u32 });
      const buffer = new ArrayBuffer(d.sizeOf(Schema));
      new Uint32Array(buffer)[0] = 3;

      expect(() => patchArrayBuffer(buffer, Schema, { a: { 0: 99 } })).toThrow(
        'Index 0 is out of bounds for an array of 0 elements.',
      );
      expect([...new Uint32Array(buffer)]).toStrictEqual([3]);
    });

    it('patches a struct with decorated props', () => {
      const Schema = d.struct({ a: d.size(16, d.u32), b: d.size(8, d.u32), c: d.u32 });
      const buffer = new ArrayBuffer(16 + 8 + 4);

      patchArrayBuffer(buffer, Schema, { c: 1 });
      expect([...new Uint32Array(buffer)]).toStrictEqual([0, 0, 0, 0, 0, 0, 1]);
    });

    it('patches a struct with runtime sized array', () => {
      const Schema = d.struct({ a: d.vec4f, b: d.arrayOf(d.u32, 0) });
      const buffer = new ArrayBuffer(32);

      patchArrayBuffer(buffer, Schema, { b: { 1: 7 } });
      expect([...new Uint32Array(buffer)]).toStrictEqual([0, 0, 0, 0, 0, 7, 0, 0]);

      expect(() =>
        patchArrayBuffer(buffer, Schema, { b: { 4: 7 } }),
      ).toThrowErrorMatchingInlineSnapshot(
        `[Error: Index 4 is out of bounds for an array of 4 elements.]`,
      );
    });

    it('patches a struct with decorated runtime sized array', () => {
      const Schema = d.struct({ a: d.u32, b: d.align(16, d.arrayOf(d.u32, 0)) });
      const buffer = new ArrayBuffer(32);

      patchArrayBuffer(buffer, Schema, { b: { 1: 7 } });
      expect([...new Uint32Array(buffer)]).toStrictEqual([0, 0, 0, 0, 0, 7, 0, 0]);

      expect(() => patchArrayBuffer(buffer, Schema, { b: { 4: 7 } })).toThrow(
        'Index 4 is out of bounds for an array of 4 elements.',
      );
    });

    it('keeps unpatched parts of arrays and structs', () => {
      const Schema = d.struct({
        arr: d.arrayOf(d.u32, 4),
        inner: d.struct({ x: d.u32, y: d.u32 }),
      });
      const buffer = new ArrayBuffer(d.sizeOf(Schema));
      writeToArrayBuffer(buffer, Schema, { arr: [1, 2, 3, 4], inner: { x: 5, y: 6 } });

      patchArrayBuffer(buffer, Schema, { arr: { 1: 7 }, inner: { y: 8 } });
      expect(readFromArrayBuffer(buffer, Schema)).toStrictEqual({
        arr: [1, 7, 3, 4],
        inner: { x: 5, y: 8 },
      });
    });

    it('keeps unpatched parts of decorated arrays and structs', () => {
      const Schema = d.struct({
        arr: d.align(16, d.arrayOf(d.u32, 4)),
        inner: d.align(16, d.struct({ x: d.u32, y: d.u32 })),
      });
      const buffer = new ArrayBuffer(d.sizeOf(Schema));
      writeToArrayBuffer(buffer, Schema, { arr: [1, 2, 3, 4], inner: { x: 5, y: 6 } });

      patchArrayBuffer(buffer, Schema, { arr: { 1: 7 }, inner: { y: 8 } });
      expect(readFromArrayBuffer(buffer, Schema)).toStrictEqual({
        arr: [1, 7, 3, 4],
        inner: { x: 5, y: 8 },
      });
    });

    it('patches a runtime-sized array from a plain array', () => {
      const Schema = d.struct({ a: d.u32, b: d.align(16, d.arrayOf(d.u32, 0)) });
      const buffer = new ArrayBuffer(32);

      patchArrayBuffer(buffer, Schema, { b: [1, 2, 3] });
      expect([...new Uint32Array(buffer)]).toStrictEqual([0, 0, 0, 0, 1, 2, 3, 0]);
    });

    it('patches a runtime-sized array from a TypedArray', () => {
      const Schema = d.struct({ a: d.u32, b: d.align(16, d.arrayOf(d.u32, 0)) });
      const buffer = new ArrayBuffer(32);

      patchArrayBuffer(buffer, Schema, { b: new Uint32Array([1, 2, 3]) });
      expect([...new Uint32Array(buffer)]).toStrictEqual([0, 0, 0, 0, 1, 2, 3, 0]);
    });

    it('does not clamp to element sizeof', () => {
      const Schema = d.arrayOf(d.vec3u, 0);
      const buffer = new ArrayBuffer(28);

      patchArrayBuffer(buffer, Schema, new Uint32Array([1, 2, 3, 4, 5, 6, 7, 8]));
      expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4, 5, 6, 7]);
    });
  });
});
