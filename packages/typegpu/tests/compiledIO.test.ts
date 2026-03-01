import { describe, expect } from 'vitest';
import { buildWriter, getCompiledWriterForSchema } from '../src/data/compiledIO.ts';
import * as d from '../src/data/index.ts';
import { sizeOf } from '../src/data/sizeOf.ts';
import { it } from './utils/extendedIt.ts';

describe('buildWriter', () => {
  it('should compile a writer for a struct', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
    });
    const writer = buildWriter(struct, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "output.setUint32((offset + 0), value.a, littleEndian);
      output.setFloat32(((offset + 16) + 0), value.b.x, littleEndian);
      output.setFloat32(((offset + 16) + 4), value.b.y, littleEndian);
      output.setFloat32(((offset + 16) + 8), value.b.z, littleEndian);
      "
    `);
  });

  it('should compile a writer for a struct with an array', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 2),
      c: d.arrayOf(d.u32, 3),
    });
    const writer = buildWriter(struct, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "output.setUint32((offset + 0), value.a, littleEndian);
      for (let i = 0; i < 2; i++) {
      output.setFloat32((((offset + 16) + i * 16) + 0), value.b[i].x, littleEndian);
      output.setFloat32((((offset + 16) + i * 16) + 4), value.b[i].y, littleEndian);
      output.setFloat32((((offset + 16) + i * 16) + 8), value.b[i].z, littleEndian);
      }
      for (let i = 0; i < 3; i++) {
      output.setUint32(((offset + 48) + i * 4), value.c[i], littleEndian);
      }
      "
    `);
  });
  it('should compile a writer for a struct with nested structs', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.struct({
        d: d.vec3f,
      }),
      c: d.arrayOf(d.struct({ d: d.u32 }), 3),
    });
    const writer = buildWriter(struct, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "output.setUint32((offset + 0), value.a, littleEndian);
      output.setFloat32((((offset + 16) + 0) + 0), value.b.d.x, littleEndian);
      output.setFloat32((((offset + 16) + 0) + 4), value.b.d.y, littleEndian);
      output.setFloat32((((offset + 16) + 0) + 8), value.b.d.z, littleEndian);
      for (let i = 0; i < 3; i++) {
      output.setUint32((((offset + 32) + i * 4) + 0), value.c[i].d, littleEndian);
      }
      "
    `);
  });
  it('should compile a writer for an array', () => {
    const array = d.arrayOf(d.vec3f, 5);

    const writer = buildWriter(array, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "for (let i = 0; i < 5; i++) {
      output.setFloat32(((offset + i * 16) + 0), value[i].x, littleEndian);
      output.setFloat32(((offset + i * 16) + 4), value[i].y, littleEndian);
      output.setFloat32(((offset + i * 16) + 8), value[i].z, littleEndian);
      }
      "
    `);
  });

  it('should compile a writer for nested arrays', () => {
    const nestedArray = d.arrayOf(d.arrayOf(d.u32, 3), 2);

    const writer = buildWriter(nestedArray, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 3; j++) {
      output.setUint32(((offset + i * 12) + j * 4), value[i][j], littleEndian);
      }
      }
      "
    `);
  });

  it('should compile a writer for struct with nested arrays', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.arrayOf(d.vec2f, 2), 2),
    });

    const writer = buildWriter(struct, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "output.setUint32((offset + 0), value.a, littleEndian);
      for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
      output.setFloat32(((((offset + 8) + i * 16) + j * 8) + 0), value.b[i][j].x, littleEndian);
      output.setFloat32(((((offset + 8) + i * 16) + j * 8) + 4), value.b[i][j].y, littleEndian);
      }
      }
      "
    `);
  });

  it('should compile a writer for deeply nested arrays', () => {
    // The WGSL minimum maximum nesting depth of a composite type is 15
    // https://www.w3.org/TR/WGSL/#limits
    // oxfmt-ignore
    const veryDeeplyNested = d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.u32, 2), 2), 2), 2), 2), 2), 2), 2), 2), 2), 2), 2), 2), 2), 2);

    const writer = buildWriter(veryDeeplyNested, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
      for (let i3 = 0; i3 < 2; i3++) {
      for (let i4 = 0; i4 < 2; i4++) {
      for (let i5 = 0; i5 < 2; i5++) {
      for (let i6 = 0; i6 < 2; i6++) {
      for (let i7 = 0; i7 < 2; i7++) {
      for (let i8 = 0; i8 < 2; i8++) {
      for (let i9 = 0; i9 < 2; i9++) {
      for (let i10 = 0; i10 < 2; i10++) {
      for (let i11 = 0; i11 < 2; i11++) {
      for (let i12 = 0; i12 < 2; i12++) {
      for (let i13 = 0; i13 < 2; i13++) {
      for (let i14 = 0; i14 < 2; i14++) {
      output.setUint32((((((((((((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048) + i6 * 1024) + i7 * 512) + i8 * 256) + i9 * 128) + i10 * 64) + i11 * 32) + i12 * 16) + i13 * 8) + i14 * 4), value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11][i12][i13][i14], littleEndian);
      }
      }
      }
      }
      }
      }
      }
      }
      }
      }
      }
      }
      }
      }
      }
      "
    `);
  });
});

describe('createCompileInstructions', () => {
  it('should compile a writer for a struct', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
    });

    const writer = getCompiledWriterForSchema(struct)!;

    const arr = new ArrayBuffer(sizeOf(struct));
    const dataView = new DataView(arr);

    writer(dataView, 0, { a: 1, b: d.vec3f(1, 2, 3) });

    expect(new Uint32Array(arr, 0, 1)[0]).toBe(1);
    expect([...new Float32Array(arr, 16, 3)]).toStrictEqual([1, 2, 3]);
  });

  it('should compile a writer for a struct with an array', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 2),
      c: d.arrayOf(d.u32, 3),
    });

    const writer = getCompiledWriterForSchema(struct)!;

    const arr = new ArrayBuffer(sizeOf(struct));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      a: 1,
      b: [d.vec3f(1, 2, 3), d.vec3f(4, 5, 6)],
      c: [1, 2, 3],
    });

    expect(new Uint32Array(arr, 0, 1)[0]).toBe(1);
    expect([...new Float32Array(arr, 16, 3)]).toStrictEqual([1, 2, 3]);
    expect([...new Float32Array(arr, 32, 3)]).toStrictEqual([4, 5, 6]);
    expect([...new Uint32Array(arr, 48, 3)]).toStrictEqual([1, 2, 3]);
  });

  it('should compile a writer for a struct with nested structs', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.struct({
        d: d.vec3f,
      }),
      c: d.arrayOf(d.struct({ d: d.u32 }), 3),
    });

    const writer = getCompiledWriterForSchema(struct)!;

    const arr = new ArrayBuffer(sizeOf(struct));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      a: 1,
      b: { d: d.vec3f(1, 2, 3) },
      c: [{ d: 1 }, { d: 2 }, { d: 3 }],
    });

    expect(new Uint32Array(arr, 0, 1)[0]).toBe(1);
    expect([...new Float32Array(arr, 16, 3)]).toStrictEqual([1, 2, 3]);
    expect([...new Uint32Array(arr, 32, 3)]).toStrictEqual([1, 2, 3]);
  });

  it('should compile a writer for an array', () => {
    const array = d.arrayOf(d.vec3f, 5);

    const writer = getCompiledWriterForSchema(array)!;

    const arr = new ArrayBuffer(sizeOf(array));
    const dataView = new DataView(arr);

    writer(dataView, 0, [
      d.vec3f(0, 1, 2),
      d.vec3f(3, 4, 5),
      d.vec3f(6, 7, 8),
      d.vec3f(9, 10, 11),
      d.vec3f(12, 13, 14),
    ]);

    for (let i = 0; i < 5; i++) {
      expect([...new Float32Array(arr, i * 16, 3)]).toStrictEqual([i * 3, i * 3 + 1, i * 3 + 2]);
    }
  });

  it('should compile a writer for nested arrays', () => {
    const nestedArray = d.arrayOf(d.arrayOf(d.u32, 3), 2);

    const writer = getCompiledWriterForSchema(nestedArray)!;

    const arr = new ArrayBuffer(sizeOf(nestedArray));
    const dataView = new DataView(arr);

    writer(dataView, 0, [
      [1, 2, 3],
      [4, 5, 6],
    ]);

    expect([...new Uint32Array(arr, 0, 3)]).toStrictEqual([1, 2, 3]);
    expect([...new Uint32Array(arr, 12, 3)]).toStrictEqual([4, 5, 6]);
  });

  it('should compile a writer for struct with nested arrays', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.arrayOf(d.vec2f, 2), 2),
    });

    const writer = getCompiledWriterForSchema(struct)!;

    const arr = new ArrayBuffer(sizeOf(struct));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      a: 42,
      b: [
        [d.vec2f(1, 2), d.vec2f(3, 4)],
        [d.vec2f(5, 6), d.vec2f(7, 8)],
      ],
    });

    expect(new Uint32Array(arr, 0, 1)[0]).toBe(42);
    expect([...new Float32Array(arr, 8, 8)]).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('should compile a writer for deeply nested arrays', () => {
    const deeplyNested = d.arrayOf(d.arrayOf(d.arrayOf(d.u32, 2), 2), 2);

    const writer = getCompiledWriterForSchema(deeplyNested)!;

    const arr = new ArrayBuffer(sizeOf(deeplyNested));
    const dataView = new DataView(arr);

    writer(dataView, 0, [
      [
        [1, 2],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
      ],
    ]);

    // First outer array element
    expect([...new Uint32Array(arr, 0, 2)]).toStrictEqual([1, 2]);
    expect([...new Uint32Array(arr, 8, 2)]).toStrictEqual([3, 4]);
    // Second outer array element
    expect([...new Uint32Array(arr, 16, 2)]).toStrictEqual([5, 6]);
    expect([...new Uint32Array(arr, 24, 2)]).toStrictEqual([7, 8]);
  });

  it('should compile a writer for a nested array with element type which size is not equal to its alignment', () => {
    const nestedArray = d.arrayOf(d.arrayOf(d.arrayOf(d.arrayOf(d.vec3f, 2), 2), 2), 2);

    expect(buildWriter(nestedArray, 'offset', 'value')).toMatchInlineSnapshot(`
      "for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
      for (let k = 0; k < 2; k++) {
      for (let i3 = 0; i3 < 2; i3++) {
      output.setFloat32((((((offset + i * 128) + j * 64) + k * 32) + i3 * 16) + 0), value[i][j][k][i3].x, littleEndian);
      output.setFloat32((((((offset + i * 128) + j * 64) + k * 32) + i3 * 16) + 4), value[i][j][k][i3].y, littleEndian);
      output.setFloat32((((((offset + i * 128) + j * 64) + k * 32) + i3 * 16) + 8), value[i][j][k][i3].z, littleEndian);
      }
      }
      }
      }
      "
    `);

    const writer = getCompiledWriterForSchema(nestedArray)!;

    expect;

    const arr = new ArrayBuffer(sizeOf(nestedArray));
    const dataView = new DataView(arr);
    writer(
      dataView,
      0,
      Array.from({ length: 2 }, (_, i) =>
        Array.from({ length: 2 }, (_, j) =>
          Array.from({ length: 2 }, (_, k) =>
            Array.from({ length: 2 }, (_, l) => d.vec3f(i * 8 + j * 4 + k * 2 + l, 0, 0)),
          ),
        ),
      ),
    );

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        for (let k = 0; k < 2; k++) {
          for (let l = 0; l < 2; l++) {
            expect([...new Float32Array(arr, i * 128 + j * 64 + k * 32 + l * 16, 3)]).toStrictEqual(
              [i * 8 + j * 4 + k * 2 + l, 0, 0],
            );
          }
        }
      }
    }
  });

  it('should compile a writer for a mat4x4f', () => {
    const Schema = d.struct({
      transform: d.mat4x4f,
    });

    const writer = getCompiledWriterForSchema(Schema)!;

    const arr = new ArrayBuffer(sizeOf(Schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      transform: d.mat4x4f(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
    });

    expect([...new Float32Array(arr)]).toStrictEqual(Array.from({ length: 16 }).map((_, i) => i));
  });

  it('should compile a writer for a mat3x3f', () => {
    const Schema = d.struct({
      transform: d.mat3x3f,
    });

    const writer = getCompiledWriterForSchema(Schema)!;

    const arr = new ArrayBuffer(sizeOf(Schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      transform: d.mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8),
    });

    expect(arr.byteLength).toBe(48);
    expect([...new Float32Array(arr)]).toStrictEqual([0, 1, 2, 0, 3, 4, 5, 0, 6, 7, 8, 0]);
  });

  it('should compile a writer for a mat2x2f', () => {
    const Schema = d.struct({
      transform: d.mat2x2f,
    });

    const writer = getCompiledWriterForSchema(Schema)!;

    const arr = new ArrayBuffer(sizeOf(Schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      transform: d.mat2x2f(0, 1, 2, 3),
    });

    expect(arr.byteLength).toBe(16);
    expect([...new Float32Array(arr)]).toStrictEqual([0, 1, 2, 3]);
  });

  it('should compile a writer for an array of u16', () => {
    const array = d.arrayOf(d.u16, 5);

    const builtWriter = buildWriter(array, 'offset', 'value');
    expect(builtWriter).toMatchInlineSnapshot(`
      "for (let i = 0; i < 5; i++) {
      output.setUint16((offset + i * 2), value[i], littleEndian);
      }
      "
    `);

    const writer = getCompiledWriterForSchema(array)!;

    const arr = new ArrayBuffer(sizeOf(array));
    const dataView = new DataView(arr);

    writer(dataView, 0, [1, 2, 3, 4, 5]);

    expect([...new Uint16Array(arr)]).toStrictEqual([1, 2, 3, 4, 5]);
  });

  it('should compile a writer for struct with size attribute', () => {
    const schema = d.struct({
      a: d.size(16, d.f32),
      b: d.arrayOf(d.f32, 2),
    });

    const builtWriter = buildWriter(schema, 'offset', 'value');
    expect(builtWriter).toMatchInlineSnapshot(`
      "output.setFloat32((offset + 0), value.a, littleEndian);
      for (let i = 0; i < 2; i++) {
      output.setFloat32(((offset + 16) + i * 4), value.b[i], littleEndian);
      }
      "
    `);

    const writer = getCompiledWriterForSchema(schema)!;

    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, { a: 1.0, b: [2.0, 3.0] });

    expect([...new Float32Array(arr)]).toStrictEqual([1.0, 0, 0, 0, 2.0, 3.0]);
  });

  it('should compile a writer for struct with align attribute', () => {
    const schema = d.struct({
      a: d.f32,
      b: d.align(64, d.arrayOf(d.f32, 2)),
    });

    const builtWriter = buildWriter(schema, 'offset', 'value');
    expect(builtWriter).toMatchInlineSnapshot(`
      "output.setFloat32((offset + 0), value.a, littleEndian);
      for (let i = 0; i < 2; i++) {
      output.setFloat32(((offset + 64) + i * 4), value.b[i], littleEndian);
      }
      "
    `);

    const writer = getCompiledWriterForSchema(schema)!;

    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, { a: 1.0, b: [2.0, 3.0] });

    expect([...new Float32Array(arr)]).toStrictEqual([
      1.0,
      ...Array.from({ length: 15 }).map(() => 0), // padding
      2.0,
      3.0,
      ...Array.from({ length: 14 }).map(() => 0), // padding
    ]);
  });

  it('should compile a writer for unstruct', () => {
    const unstruct = d.unstruct({
      a: d.vec3f,
      b: d.vec4f,
    });

    const builtWriter = buildWriter(unstruct, 'offset', 'value');
    expect(builtWriter).toMatchInlineSnapshot(`
      "output.setFloat32(((offset + 0) + 0), value.a.x, littleEndian);
      output.setFloat32(((offset + 0) + 4), value.a.y, littleEndian);
      output.setFloat32(((offset + 0) + 8), value.a.z, littleEndian);
      output.setFloat32(((offset + 12) + 0), value.b.x, littleEndian);
      output.setFloat32(((offset + 12) + 4), value.b.y, littleEndian);
      output.setFloat32(((offset + 12) + 8), value.b.z, littleEndian);
      output.setFloat32(((offset + 12) + 12), value.b.w, littleEndian);
      "
    `);

    const writer = getCompiledWriterForSchema(unstruct)!;

    const arr = new ArrayBuffer(sizeOf(unstruct));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      a: d.vec3f(1, 2, 3),
      b: d.vec4f(3, 4, 5, 6),
    });

    expect([...new Float32Array(arr)]).toStrictEqual([1, 2, 3, 3, 4, 5, 6]);
  });

  it('should compile a writer for a disarray', () => {
    const disarray = d.disarrayOf(d.vec3f, 3);

    const builtWriter = buildWriter(disarray, 'offset', 'value');
    expect(builtWriter).toMatchInlineSnapshot(`
      "for (let i = 0; i < 3; i++) {
      output.setFloat32(((offset + i * 12) + 0), value[i].x, littleEndian);
      output.setFloat32(((offset + i * 12) + 4), value[i].y, littleEndian);
      output.setFloat32(((offset + i * 12) + 8), value[i].z, littleEndian);
      }
      "
    `);

    const writer = getCompiledWriterForSchema(disarray)!;

    const arr = new ArrayBuffer(sizeOf(disarray));
    const dataView = new DataView(arr);

    writer(dataView, 0, [d.vec3f(1, 2, 3), d.vec3f(4, 5, 6), d.vec3f(7, 8, 9)]);

    expect([...new Float32Array(arr)]).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('should compile for a disarray of unstructs', () => {
    const unstruct = d.unstruct({
      a: d.vec3f,
      b: d.vec4f,
    });
    const disarray = d.disarrayOf(unstruct, 2);

    const builtWriter = buildWriter(disarray, 'offset', 'value');
    expect(builtWriter).toMatchInlineSnapshot(`
      "for (let i = 0; i < 2; i++) {
      output.setFloat32((((offset + i * 28) + 0) + 0), value[i].a.x, littleEndian);
      output.setFloat32((((offset + i * 28) + 0) + 4), value[i].a.y, littleEndian);
      output.setFloat32((((offset + i * 28) + 0) + 8), value[i].a.z, littleEndian);
      output.setFloat32((((offset + i * 28) + 12) + 0), value[i].b.x, littleEndian);
      output.setFloat32((((offset + i * 28) + 12) + 4), value[i].b.y, littleEndian);
      output.setFloat32((((offset + i * 28) + 12) + 8), value[i].b.z, littleEndian);
      output.setFloat32((((offset + i * 28) + 12) + 12), value[i].b.w, littleEndian);
      }
      "
    `);

    const writer = getCompiledWriterForSchema(disarray)!;

    const arr = new ArrayBuffer(sizeOf(disarray));
    const dataView = new DataView(arr);

    writer(dataView, 0, [
      { a: d.vec3f(1, 2, 3), b: d.vec4f(4, 5, 6, 7) },
      { a: d.vec3f(8, 9, 10), b: d.vec4f(11, 12, 13, 14) },
    ]);

    expect([...new Float32Array(arr)]).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
    ]);
  });

  it('should work for unstructs with loose data', () => {
    const unstruct = d.unstruct({
      a: d.uint16x2,
      b: d.unorm10_10_10_2,
      c: d.uint8x2,
      d: d.unorm8x4,
    });

    const unstructWriter = buildWriter(unstruct, 'offset', 'value');
    expect(unstructWriter).toMatchInlineSnapshot(`
      "output.setUint16(((offset + 0) + 0), value.a.x, littleEndian);
      output.setUint16(((offset + 0) + 2), value.a.y, littleEndian);
      output.setUint32((offset + 4), ((value.b.x*1023&0x3FF)<<22)|((value.b.y*1023&0x3FF)<<12)|((value.b.z*1023&0x3FF)<<2)|(value.b.w*3&3), littleEndian);
      output.setUint8(((offset + 8) + 0), value.c.x, littleEndian);
      output.setUint8(((offset + 8) + 1), value.c.y, littleEndian);
      output.setUint8(((offset + 10) + 0), Math.round(value.d.x * 255), littleEndian);
      output.setUint8(((offset + 10) + 1), Math.round(value.d.y * 255), littleEndian);
      output.setUint8(((offset + 10) + 2), Math.round(value.d.z * 255), littleEndian);
      output.setUint8(((offset + 10) + 3), Math.round(value.d.w * 255), littleEndian);
      "
    `);
    const writer = getCompiledWriterForSchema(unstruct)!;

    const arr = new ArrayBuffer(sizeOf(unstruct));
    const dataView = new DataView(arr);

    const inputData = {
      a: d.vec2u(1, 2),
      b: d.vec4f(0.25, 0.5, 0.75, 1),
      c: d.vec2u(7, 8),
      d: d.vec4f(0.34, 0.67, 0.91, 1),
    };

    writer(dataView, 0, inputData);

    const decoded = {
      a: d.vec2f(dataView.getUint16(0, true), dataView.getUint16(2, true)),
      b: (() => {
        const packed = dataView.getUint32(4, true);
        return d.vec4f(
          ((packed >> 22) & 0x3ff) / 1023,
          ((packed >> 12) & 0x3ff) / 1023,
          ((packed >> 2) & 0x3ff) / 1023,
          (packed & 3) / 3,
        );
      })(),
      c: d.vec2u(dataView.getUint8(8), dataView.getUint8(9)),
      d: d.vec4f(
        dataView.getUint8(10) / 255,
        dataView.getUint8(11) / 255,
        dataView.getUint8(12) / 255,
        dataView.getUint8(13) / 255,
      ),
    };

    expect(decoded.a).toEqual(inputData.a);
    expect(decoded.b.x).toBeCloseTo(inputData.b.x, 2);
    expect(decoded.b.y).toBeCloseTo(inputData.b.y, 2);
    expect(decoded.b.z).toBeCloseTo(inputData.b.z, 2);
    expect(decoded.b.w).toBeCloseTo(inputData.b.w, 1);
    expect(decoded.c).toEqual(inputData.c);
    expect(decoded.d.x).toBeCloseTo(inputData.d.x, 2);
    expect(decoded.d.y).toBeCloseTo(inputData.d.y, 2);
    expect(decoded.d.z).toBeCloseTo(inputData.d.z, 2);
    expect(decoded.d.w).toBeCloseTo(inputData.d.w, 2);
  });

  it('should work for disarrays of unstructs containing loose data', () => {
    const unstruct = d.unstruct({
      a: d.unorm16x2,
      b: d.unorm8x4_bgra,
      c: d.snorm8x4,
      d: d.snorm16x2,
      e: d.sint8x2,
      f: d.sint16x2,
    });

    const disarray = d.disarrayOf(unstruct, 2);
    const disarrayWriter = buildWriter(disarray, 'offset', 'value');
    expect(disarrayWriter).toMatchInlineSnapshot(`
      "for (let i = 0; i < 2; i++) {
      output.setUint16((((offset + i * 22) + 0) + 0), Math.round(value[i].a.x * 65535), littleEndian);
      output.setUint16((((offset + i * 22) + 0) + 2), Math.round(value[i].a.y * 65535), littleEndian);
      output.setUint8((((offset + i * 22) + 4) + 0), Math.round(value[i].b.z * 255), littleEndian);
      output.setUint8((((offset + i * 22) + 4) + 1), Math.round(value[i].b.y * 255), littleEndian);
      output.setUint8((((offset + i * 22) + 4) + 2), Math.round(value[i].b.x * 255), littleEndian);
      output.setUint8((((offset + i * 22) + 4) + 3), Math.round(value[i].b.w * 255), littleEndian);
      output.setInt8((((offset + i * 22) + 8) + 0), Math.round(value[i].c.x * 127), littleEndian);
      output.setInt8((((offset + i * 22) + 8) + 1), Math.round(value[i].c.y * 127), littleEndian);
      output.setInt8((((offset + i * 22) + 8) + 2), Math.round(value[i].c.z * 127), littleEndian);
      output.setInt8((((offset + i * 22) + 8) + 3), Math.round(value[i].c.w * 127), littleEndian);
      output.setInt16((((offset + i * 22) + 12) + 0), Math.round(value[i].d.x * 32767), littleEndian);
      output.setInt16((((offset + i * 22) + 12) + 2), Math.round(value[i].d.y * 32767), littleEndian);
      output.setInt8((((offset + i * 22) + 16) + 0), value[i].e.x, littleEndian);
      output.setInt8((((offset + i * 22) + 16) + 1), value[i].e.y, littleEndian);
      output.setInt16((((offset + i * 22) + 18) + 0), value[i].f.x, littleEndian);
      output.setInt16((((offset + i * 22) + 18) + 2), value[i].f.y, littleEndian);
      }
      "
    `);

    const compiled = getCompiledWriterForSchema(disarray)!;

    const arr = new ArrayBuffer(sizeOf(disarray));
    const dataView = new DataView(arr);

    const inputData = [
      {
        a: d.vec2f(0.5, 0.25),
        b: d.vec4f(0.25, 0.5, 0.75, 1),
        c: d.vec4f(-0.5, 0.5, -0.25, 0.75),
        d: d.vec2f(0.34, 0.67),
        e: d.vec2i(1, 2),
        f: d.vec2i(3, 4),
      },
      {
        a: d.vec2f(0.75, 1.0),
        b: d.vec4f(0.1, 0.2, 0.3, 0.4),
        c: d.vec4f(0.1, -0.1, 0.9, -0.9),
        d: d.vec2f(-0.5, 0.8),
        e: d.vec2i(5, 6),
        f: d.vec2i(7, 8),
      },
    ];

    compiled(dataView, 0, inputData);

    const decoded = [];
    for (let i = 0; i < 2; i++) {
      const offset = i * 22;
      decoded.push({
        a: d.vec2f(
          dataView.getUint16(offset + 0, true) / 65535,
          dataView.getUint16(offset + 2, true) / 65535,
        ),
        b: d.vec4f(
          dataView.getUint8(offset + 6) / 255,
          dataView.getUint8(offset + 5) / 255,
          dataView.getUint8(offset + 4) / 255,
          dataView.getUint8(offset + 7) / 255,
        ),
        c: d.vec4f(
          dataView.getInt8(offset + 8) / 127,
          dataView.getInt8(offset + 9) / 127,
          dataView.getInt8(offset + 10) / 127,
          dataView.getInt8(offset + 11) / 127,
        ),
        d: d.vec2f(
          dataView.getInt16(offset + 12, true) / 32767,
          dataView.getInt16(offset + 14, true) / 32767,
        ),
        e: d.vec2i(dataView.getInt8(offset + 16), dataView.getInt8(offset + 17)),
        f: d.vec2i(dataView.getInt16(offset + 18, true), dataView.getInt16(offset + 20, true)),
      });
    }

    for (let i = 0; i < 2; i++) {
      const result = decoded[i]!;
      const expected = inputData[i]!;
      expect(result.a.x).toBeCloseTo(expected.a.x, 4);
      expect(result.a.y).toBeCloseTo(expected.a.y, 4);
      expect(result.b.x).toBeCloseTo(expected.b.x, 2);
      expect(result.b.y).toBeCloseTo(expected.b.y, 2);
      expect(result.b.z).toBeCloseTo(expected.b.z, 2);
      expect(result.b.w).toBeCloseTo(expected.b.w, 2);
      expect(result.c.x).toBeCloseTo(expected.c.x, 2);
      expect(result.c.y).toBeCloseTo(expected.c.y, 2);
      expect(result.c.z).toBeCloseTo(expected.c.z, 2);
      expect(result.c.w).toBeCloseTo(expected.c.w, 2);
      expect(result.d.x).toBeCloseTo(expected.d.x, 3);
      expect(result.d.y).toBeCloseTo(expected.d.y, 3);
      expect(result.e).toEqual(expected.e);
      expect(result.f).toEqual(expected.f);
    }
  });
});
