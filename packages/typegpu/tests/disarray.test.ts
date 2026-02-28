import { BufferReader, BufferWriter } from 'typed-binary';
import { describe, expect, expectTypeOf } from 'vitest';
import { readData, writeData } from '../src/data/dataIO.ts';
import * as d from '../src/data/index.ts';
import { it } from './utils/extendedIt.ts';

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
    const writer = new BufferWriter(buffer);

    writeData(writer, TestArray, [d.vec3u(1, 2, 3), d.vec3u(4, 5, 6), d.vec3u(7, 8, 9)]);
    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('aligns array elements when writing with custom aligned elements', () => {
    const TestArray = d.disarrayOf(d.align(16, d.vec3u), 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const writer = new BufferWriter(buffer);

    writeData(writer, TestArray, [d.vec3u(1, 2, 3), d.vec3u(4, 5, 6), d.vec3u(7, 8, 9)]);
    expect([...new Uint32Array(buffer)]).toStrictEqual([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);
  });

  it('does not align array elements when reading', () => {
    const TestArray = d.disarrayOf(d.vec3u, 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7]);

    expect(readData(reader, TestArray)).toStrictEqual([
      d.vec3u(1, 2, 3),
      d.vec3u(0, 4, 5),
      d.vec3u(6, 0, 7),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements', () => {
    const TestArray = d.disarrayOf(d.align(16, d.vec3u), 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readData(reader, TestArray)).toStrictEqual([
      d.vec3u(1, 2, 3),
      d.vec3u(4, 5, 6),
      d.vec3u(7, 8, 9),
    ]);
  });

  it('aligns array elements when reading with custom aligned elements and other attributes', () => {
    const TestArray = d.disarrayOf(d.size(12, d.align(16, d.vec3u)), 3);
    const buffer = new ArrayBuffer(d.sizeOf(TestArray));
    const reader = new BufferReader(buffer);

    new Uint32Array(buffer).set([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]);

    expect(readData(reader, TestArray)).toStrictEqual([
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

    writeData(new BufferWriter(buffer), TestArray, value);
    expect(readData(new BufferReader(buffer), TestArray)).toStrictEqual(value);
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
});
