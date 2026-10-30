import { describe, expect, expectTypeOf } from 'vitest';
import { readFromArrayBuffer, tgpu, writeToArrayBuffer } from 'typegpu';
import * as d from 'typegpu/data';
import { it } from 'typegpu-testing-utility';

describe('disarray', () => {
  it('does not take element alignment into account when measuring', () => {
    const TestArray = d.disarrayOf(d.vec3u, 3);
    expect(d.sizeOf(TestArray)).toBe(36);
  });

  it('takes element alignment into account when measuring with custom aligned elements', () => {
    const TestArray = d.disarrayOf(d.align(16, d.vec3u), 3);
    expect(d.sizeOf(TestArray)).toBe(48);
  });

  it('properly handles calculating nested loose array size', () => {
    const TestArray = d.disarrayOf(d.disarrayOf(d.vec3u, 3), 3);
    expect(d.sizeOf(TestArray)).toBe(108);
  });

  it('does not align array elements when writing', () => {
    const TestArray = d.disarrayOf(d.vec3u, 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));

    writeToArrayBuffer(buffer, TestArray, [d.vec3u(1, 2, 3), d.vec3u(4, 5, 6), d.vec3u(7, 8, 9)]);
    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('aligns array elements when writing with custom aligned elements', () => {
    const TestArray = d.disarrayOf(d.align(16, d.vec3u), 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));

    writeToArrayBuffer(buffer, TestArray, [d.vec3u(1, 2, 3), d.vec3u(4, 5, 6), d.vec3u(7, 8, 9)]);
    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  });

  it('does not align array elements when reading', () => {
    const TestArray = d.disarrayOf(d.vec3u, 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7]);

    expect(readFromArrayBuffer(buffer, TestArray)).toStrictEqual([
      d.vec3u(1, 2, 3),
      d.vec3u(0, 4, 5),
      d.vec3u(6, 0, 7),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements', () => {
    const TestArray = d.disarrayOf(d.align(16, d.vec3u), 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readFromArrayBuffer(buffer, TestArray)).toStrictEqual([
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements and other attributes', () => {
    const TestArray = d.disarrayOf(d.size(12, d.align(16, d.vec3u)), 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readFromArrayBuffer(buffer, TestArray)).toStrictEqual([
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
  });

  it('encodes and decodes arrays properly', () => {
    const TestArray = d.disarrayOf(d.vec3f, 5);

    const buffer = new ArrayBuffer(d.sizeOf(TestArray));

    const value: d.Infer<typeof TestArray> = [
      d.vec3f(1.5, 2, 3.5),
      d.vec3f(),
      d.vec3f(-1.5, 2, 3.5),
      d.vec3f(1.5, -2, 3.5),
      d.vec3f(1.5, 2, 15),
    ];

    writeToArrayBuffer(buffer, TestArray, value);
    expect(readFromArrayBuffer(buffer, TestArray)).toStrictEqual(value);
  });

  it('can be called to create a disarray', () => {
    const DisarraySchema = d.disarrayOf(d.uint16x2, 2);

    const obj = DisarraySchema([d.vec2u(1, 2), d.vec2u(3, 4)]);

    expect(obj).toStrictEqual([d.vec2u(1, 2), d.vec2u(3, 4)]);
    expectTypeOf(obj).toEqualTypeOf<d.v2u[]>();
  });

  it('cannot be called with invalid elements', () => {
    const DisarraySchema = d.disarrayOf(d.unorm16x2, 2);

    // @ts-expect-error
    () => DisarraySchema([d.vec2f(), d.vec3f()]);
    // @ts-expect-error
    () => DisarraySchema([d.vec3f(), d.vec3f()]);
  });

  it('can be called to create a deep copy of other disarray', () => {
    const InnerSchema = d.disarrayOf(d.uint16x2, 2);
    const OuterSchema = d.disarrayOf(InnerSchema, 1);
    const instance = OuterSchema([InnerSchema([d.vec2u(1, 2), d.vec2u()])]);

    const clone = OuterSchema(instance);

    expect(clone).toStrictEqual(instance);
    expect(clone).not.toBe(instance);
    expect(clone[0]).not.toBe(instance[0]);
    expect(clone[0]).not.toBe(clone[1]);
    expect(clone[0]?.[0]).not.toBe(instance[0]?.[0]);
    expect(clone[0]?.[0]).toStrictEqual(d.vec2u(1, 2));
  });

  it('throws when invalid number of arguments', () => {
    const DisarraySchema = d.disarrayOf(d.float32x2, 2);

    expect(() => DisarraySchema([d.vec2f()])).toThrowErrorMatchingInlineSnapshot(
      '[Error: Disarray schema of 2 elements of type float32x2 called with 1 argument(s).]',
    );
    expect(() =>
      DisarraySchema([d.vec2f(), d.vec2f(), d.vec2f()]),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: Disarray schema of 2 elements of type float32x2 called with 3 argument(s).]',
    );
  });

  it('can be called to create a default value', () => {
    const DisarraySchema = d.disarrayOf(d.float32x3, 2);

    const defaultDisarray = DisarraySchema();

    expect(defaultDisarray).toStrictEqual([d.vec3f(), d.vec3f()]);
  });

  it('can be called to create a default value with nested unstruct', () => {
    const UnstructSchema = d.unstruct({ vec: d.float32x3 });
    const DisarraySchema = d.disarrayOf(UnstructSchema, 2);

    const defaultDisarray = DisarraySchema();

    expect(defaultDisarray).toStrictEqual([{ vec: d.vec3f() }, { vec: d.vec3f() }]);
  });

  it('can be partially called', () => {
    const DisarrayPartialSchema = d.disarrayOf(d.vec3u);

    const disarray3 = DisarrayPartialSchema(3)([
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
    expect(disarray3).toStrictEqual([d.vec3u(1, 2, 3), d.vec3u(4, 5, 6), d.vec3u(7, 8, 9)]);

    const disarray7 = DisarrayPartialSchema(7)([
      d.vec3u(1, 1, 1),
      d.vec3u(1, 2, 1),
      d.vec3u(1, 3, 1),
      d.vec3u(1, 5, 1),
      d.vec3u(1, 3, 1),
      d.vec3u(1, 2, 1),
      d.vec3u(1, 1, 1),
    ]);
    expect(disarray7).toStrictEqual([
      d.vec3u(1, 1, 1),
      d.vec3u(1, 2, 1),
      d.vec3u(1, 3, 1),
      d.vec3u(1, 5, 1),
      d.vec3u(1, 3, 1),
      d.vec3u(1, 2, 1),
      d.vec3u(1, 1, 1),
    ]);
  });

  describe('with nested custom alignment', () => {
    const AlignedFromFirstField = d.unstruct({ x: d.align(16, d.f32) });
    const AlignedFromNestedFirstField = d.unstruct({ inner: AlignedFromFirstField, y: d.f32 });
    const LocallyAligned = d.unstruct({ a: d.f32, b: d.align(16, d.f32) });

    it('takes custom alignment from its elements', () => {
      expect(d.alignmentOf(d.disarrayOf(AlignedFromFirstField, 2))).toBe(16);
      expect(d.alignmentOf(d.disarrayOf(AlignedFromNestedFirstField, 2))).toBe(16);
      expect(d.alignmentOf(d.disarrayOf(LocallyAligned, 2))).toBe(1);
      expect(d.alignmentOf(d.unstruct({ arr: d.disarrayOf(AlignedFromFirstField, 2) }))).toBe(16);
    });

    it("inherits only the first struct field's explicit alignment through nesting", () => {
      const Explicit = d.struct({ x: d.align(16, d.f32) });
      const Implicit = d.struct({ x: d.vec4f });
      const NonFirst = d.struct({ x: d.f32, y: d.align(16, d.f32) });
      const Nested = d.struct({ inner: Explicit, y: d.f32 });

      expect(d.alignmentOf(d.disarrayOf(Explicit, 2))).toBe(16);
      expect(d.alignmentOf(d.disarrayOf(Implicit, 2))).toBe(1);
      expect(d.alignmentOf(d.disarrayOf(NonFirst, 2))).toBe(1);
      expect(d.alignmentOf(d.disarrayOf(Nested, 2))).toBe(16);
      expect(d.alignmentOf(d.unstruct({ arr: d.disarrayOf(Explicit, 2) }))).toBe(16);
    });

    it('pads elements to the custom alignment', () => {
      expect(d.sizeOf(d.disarrayOf(AlignedFromNestedFirstField, 2))).toBe(32);
      expect(d.sizeOf(d.disarrayOf(LocallyAligned, 2))).toBe(40);
    });

    it('pads elements to the custom alignment of a nested unstruct', () => {
      const TestArray = d.disarrayOf(AlignedFromNestedFirstField, 2);
      const buffer = new ArrayBuffer(d.sizeOf(TestArray));
      const value = [
        { inner: { x: 1 }, y: 2 },
        { inner: { x: 3 }, y: 4 },
      ];

      writeToArrayBuffer(buffer, TestArray, value);

      expect([...new Float32Array(buffer)]).toStrictEqual([1, 2, 0, 0, 3, 4, 0, 0]);
      expect(readFromArrayBuffer(buffer, TestArray)).toStrictEqual(value);
    });

    it('places non-first aligned fields relative to the element', () => {
      const TestArray = d.disarrayOf(LocallyAligned, 2);
      const buffer = new ArrayBuffer(d.sizeOf(TestArray));
      const value = [
        { a: 1, b: 2 },
        { a: 3, b: 4 },
      ];

      writeToArrayBuffer(buffer, TestArray, value);

      expect([...new Float32Array(buffer)]).toStrictEqual([1, 0, 0, 0, 2, 3, 0, 0, 0, 4]);
      expect(readFromArrayBuffer(buffer, TestArray)).toStrictEqual(value);
    });

    it('introduces padding before a disarray nested in an unstruct', () => {
      const Outer = d.unstruct({ a: d.f32, b: d.disarrayOf(AlignedFromFirstField, 2), c: d.f32 });
      const buffer = new ArrayBuffer(d.sizeOf(Outer));
      const value = { a: 1, b: [{ x: 2 }, { x: 3 }], c: 4 };

      writeToArrayBuffer(buffer, Outer, value);

      expect([...new Float32Array(buffer)]).toStrictEqual([1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4]);
      expect(readFromArrayBuffer(buffer, Outer)).toStrictEqual(value);
    });

    it('uses the custom alignment of nested unstructs as vertex layout stride', () => {
      expect(tgpu.vertexLayout(d.disarrayOf(AlignedFromNestedFirstField)).stride).toBe(16);
      expect(tgpu.vertexLayout(d.disarrayOf(LocallyAligned)).stride).toBe(20);
    });
  });
});
