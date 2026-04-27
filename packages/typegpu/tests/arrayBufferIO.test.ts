import { attest } from '@ark/attest';
import { describe, expect, expectTypeOf, vi } from 'vitest';
import * as common from '../src/common/index.ts';
import * as d from '../src/data/index.ts';
import { sizeOf } from '../src/data/sizeOf.ts';
import {
  patchArrayBuffer,
  readFromArrayBuffer,
  writeToArrayBuffer,
  type ValidateBufferSchema,
  type ValidUsagesFor,
} from '../src/index.js';
import { getName } from '../src/shared/meta.ts';
import type { InferPatch, IsValidBufferSchema, IsValidUniformSchema } from '../src/shared/repr.ts';
import type { TypedArray } from '../src/shared/utilityTypes.ts';
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
      const buffer = new ArrayBuffer(32);
      const Numbers = d.arrayOf(d.u32, 8);
      const layout = d.memoryLayoutOf(Numbers, (a) => a[4]);

      writeToArrayBuffer(buffer, Numbers, [1, 2, 3, 4], { startOffset: layout.contiguous });

      expect([...new Uint32Array(buffer)]).toStrictEqual([0, 0, 0, 0, 1, 2, 3, 4]);
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
