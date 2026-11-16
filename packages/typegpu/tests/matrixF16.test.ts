import { describe, expect, expectTypeOf } from 'vitest';
import { common, d, std, tgpu } from 'typegpu';
import { readFromArrayBuffer, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

describe('f16 matrices', () => {
  describe('construction', () => {
    it('creates zero matrices', () => {
      expect(d.mat2x2h().columns).toStrictEqual([d.vec2h(), d.vec2h()]);
      expect(d.mat3x3h().columns).toStrictEqual([d.vec3h(), d.vec3h(), d.vec3h()]);
      expect(d.mat4x4h().columns).toStrictEqual([d.vec4h(), d.vec4h(), d.vec4h(), d.vec4h()]);
    });

    it('creates matrices from elements and columns', () => {
      expect(d.mat2x2h(0, 1, 2, 3).columns).toStrictEqual([d.vec2h(0, 1), d.vec2h(2, 3)]);
      expect(
        d.mat3x3h(d.vec3h(0, 1, 2), d.vec3h(3, 4, 5), d.vec3h(6, 7, 8)).columns[2],
      ).toStrictEqual(d.vec3h(6, 7, 8));
      expect(d.matToArray(d.mat3x3h(0, 1, 2, 3, 4, 5, 6, 7, 8))).toStrictEqual([
        0, 1, 2, 3, 4, 5, 6, 7, 8,
      ]);
    });

    it('stores elements with half precision', () => {
      const mat = d.mat2x2h(0.1, 1, 2, 3);
      expect(mat[0]).toBe(d.vec2h(0.1).x);
      expect(mat[0]).not.toBe(0.1);
    });

    it('converts from f32 matrices and back', () => {
      const half = d.mat2x2h(d.mat2x2f(1, 2, 3, 4));
      expect(half.kind).toBe('mat2x2h');
      expect(d.matToArray(half)).toStrictEqual([1, 2, 3, 4]);

      const full = d.mat2x2f(half);
      expect(full.kind).toBe('mat2x2f');
      expect(d.matToArray(full)).toStrictEqual([1, 2, 3, 4]);
    });

    it('has identity matrices', () => {
      expect(d.mat2x2h.identity()).toStrictEqual(d.mat2x2h(1, 0, 0, 1));
      expect(d.mat3x3h.identity()).toStrictEqual(d.mat3x3h(1, 0, 0, 0, 1, 0, 0, 0, 1));
      expect(d.mat4x4h.identity()).toStrictEqual(
        d.mat4x4h(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1),
      );
    });

    it('does not expose f32-only 4x4 transform helpers', () => {
      expect('translation' in d.mat4x4h).toBe(false);
      expect('translation' in d.mat4x4f).toBe(true);
    });

    it('has the expected types', () => {
      expectTypeOf(d.mat2x2h()).toEqualTypeOf<d.m2x2h>();
      expectTypeOf(d.mat3x3h().columns).toEqualTypeOf<readonly [d.v3h, d.v3h, d.v3h]>();
      expectTypeOf(d.mat4x4h.identity()).toEqualTypeOf<d.m4x4h>();
      expectTypeOf<d.Infer<d.Mat3x3h>>().toEqualTypeOf<d.m3x3h>();
      expectTypeOf<Float16Array>().toExtend<d.InferInput<d.Mat4x4h>>();
    });
  });

  describe('memory layout', () => {
    it('has the WGSL size and alignment', () => {
      expect([d.sizeOf(d.mat2x2h), d.alignmentOf(d.mat2x2h)]).toStrictEqual([8, 4]);
      expect([d.sizeOf(d.mat3x3h), d.alignmentOf(d.mat3x3h)]).toStrictEqual([24, 8]);
      expect([d.sizeOf(d.mat4x4h), d.alignmentOf(d.mat4x4h)]).toStrictEqual([32, 8]);
    });

    it('lays out arrays and structs of f16 matrices', () => {
      expect(d.sizeOf(d.arrayOf(d.mat3x3h, 3))).toBe(72);
      const Schema = d.struct({ a: d.f16, m: d.mat3x3h, b: d.f16 });
      expect(d.memoryLayoutOf(Schema, (s) => s.m).offset).toBe(8);
      expect(d.memoryLayoutOf(Schema, (s) => s.b).offset).toBe(32);
      expect(d.sizeOf(Schema)).toBe(40);
    });

    it('computes offsets of columns with memoryLayoutOf', () => {
      expect(d.memoryLayoutOf(d.mat2x2h).contiguous).toBe(8);
      expect(d.memoryLayoutOf(d.mat3x3h).contiguous).toBe(6);

      const column = d.memoryLayoutOf(d.mat3x3h, (m) => m.columns[2]);
      expect(column.offset).toBe(16);
      expect(column.contiguous).toBe(6);

      const component = d.memoryLayoutOf(d.mat4x4h, (m) => m.columns[1].z);
      expect(component.offset).toBe(12);
      expect(component.contiguous).toBe(20);
    });
  });

  describe('serialization', () => {
    it('round-trips f16 matrices through an ArrayBuffer', () => {
      const roundTrip = <T extends d.Mat2x2h | d.Mat3x3h | d.Mat4x4h>(
        schema: T,
        value: d.Infer<T>,
      ) => {
        const buffer = new ArrayBuffer(d.sizeOf(schema));
        writeToArrayBuffer(buffer, schema, value);
        return readFromArrayBuffer(buffer, schema);
      };

      const m2 = d.mat2x2h(0.5, 1, 2, 3);
      const m3 = d.mat3x3h(0.5, 1, 2, 3, 4, 5, 6, 7, 8);
      const m4 = d.mat4x4h(0.5, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15);
      expect(roundTrip(d.mat2x2h, m2)).toStrictEqual(m2);
      expect(roundTrip(d.mat3x3h, m3)).toStrictEqual(m3);
      expect(roundTrip(d.mat4x4h, m4)).toStrictEqual(m4);
    });

    it('writes mat3x3h with column padding', () => {
      const buffer = new ArrayBuffer(d.sizeOf(d.mat3x3h));
      writeToArrayBuffer(buffer, d.mat3x3h, d.mat3x3h(1, 2, 3, 4, 5, 6, 7, 8, 9));
      expect([...new Float16Array(buffer)]).toStrictEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
    });

    it('writes mat3x3h from a tuple of 9 elements', () => {
      const buffer = new ArrayBuffer(d.sizeOf(d.mat3x3h));
      writeToArrayBuffer(buffer, d.mat3x3h, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect([...new Float16Array(buffer)]).toStrictEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
    });

    it('writes SoA data with f16 matrix fields', ({ root, device }) => {
      const schema = d.arrayOf(d.struct({ m: d.mat3x3h }), 2);
      const buffer = root.createBuffer(schema);
      root.unwrap(buffer);

      common.writeSoA(buffer, {
        m: new Float16Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]),
      });

      const uploaded = device.mock.queue.writeBuffer.mock.calls[0]?.[2] as ArrayBuffer;
      // oxfmt-ignore
      expect([...new Float16Array(uploaded)]).toStrictEqual([
        1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0,
        10, 11, 12, 0, 13, 14, 15, 0, 16, 17, 18, 0,
      ]);
    });
  });

  describe('CPU operations', () => {
    it('multiplies matrices and vectors', () => {
      const m = d.mat2x2h(1, 2, 3, 4);
      expect(std.mul(m, d.vec2h(1, 1))).toStrictEqual(d.vec2h(4, 6));
      expect(std.mul(d.vec2h(1, 1), m)).toStrictEqual(d.vec2h(3, 7));
      expect(std.mul(m, m)).toStrictEqual(d.mat2x2h(7, 10, 15, 22));
      expect(std.mul(m, 2)).toStrictEqual(d.mat2x2h(2, 4, 6, 8));
      expect(m.mul(d.vec2h(1, 0))).toStrictEqual(d.vec2h(1, 2));
    });

    it('adds and transposes matrices', () => {
      const m = d.mat3x3h(1, 2, 3, 4, 5, 6, 7, 8, 9);
      expect(std.add(m, m)).toStrictEqual(d.mat3x3h(2, 4, 6, 8, 10, 12, 14, 16, 18));
      expect(std.transpose(m)).toStrictEqual(d.mat3x3h(1, 4, 7, 2, 5, 8, 3, 6, 9));
    });

    it('rejects mixing f16 matrices with f32 vectors', () => {
      expect(() => std.mul(d.mat2x2h(), d.vec2f() as unknown as d.v2h)).toThrow(
        /cannot be multiplied/,
      );
    });
  });

  describe('code generation', () => {
    it('resolves constants', () => {
      const mat = d.mat2x2h(0, 1, 2, 3);
      expect(tgpu.resolve({ template: 'mat', externals: { mat } })).toContain(
        'mat2x2h(0, 1, 2, 3)',
      );
    });

    it('generates WGSL for f16 matrix code', () => {
      const fn = (m: d.m3x3h, v: d.v3h) => {
        'use gpu';
        const id = d.mat3x3h.identity();
        const scaled = std.mul(m, id);
        const t = std.transpose(scaled);
        const col = t.columns[1];
        const det = std.determinant(t);
        return std.mul(t, v).add(col).mul(det);
      };

      const f = tgpu.fn([d.mat3x3h, d.vec3h], d.vec3h)(fn);

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn fn_1(m: mat3x3h, v: vec3h) -> vec3h {
          let id = mat3x3h(1, 0, 0, 0, 1, 0, 0, 0, 1);
          let scaled = (m * id);
          var t = transpose(scaled);
          let col = (&t[1i]);
          let det = determinant(t);
          return (((t * v) + (*col)) * det);
        }"
      `);
    });

    it('converts between f16 and f32 matrices in WGSL', () => {
      const f = tgpu.fn(
        [d.mat4x4f],
        d.mat4x4h,
      )((m) => {
        'use gpu';
        return d.mat4x4h(m);
      });

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "fn f(m: mat4x4f) -> mat4x4h {
          return mat4x4h(m);
        }"
      `);
    });

    it('declares f16 matrices in buffers', ({ root }) => {
      const Schema = d.struct({ transform: d.mat3x3h });
      const uniform = root.createUniform(Schema);
      const f = tgpu.fn(
        [],
        d.vec3h,
      )(() => {
        'use gpu';
        return uniform.$.transform.columns[0];
      });

      expect(tgpu.resolve([f])).toMatchInlineSnapshot(`
        "struct Schema {
          transform: mat3x3h,
        }

        @group(0) @binding(0) var<uniform> uniform_1: Schema;

        fn f() -> vec3h {
          return uniform_1.transform[0i];
        }"
      `);
    });
  });
});
