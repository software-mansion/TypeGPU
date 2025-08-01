import { describe, expect } from 'vitest';
import {
  buildWriter,
  getCompiledWriterForSchema,
} from '../src/data/compiledIO.ts';
import * as d from '../src/data/index.ts';
import { sizeOf } from '../src/data/sizeOf.ts';
import { it } from './utils/extendedIt.ts';
import tgpu from '../src/index.ts';

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
});

describe('createCompileInstructions', () => {
  it('should compile a writer for a struct', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
    });

    const writer = getCompiledWriterForSchema(struct);
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

    const writer = getCompiledWriterForSchema(struct);

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

    const writer = getCompiledWriterForSchema(struct);

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

    const writer = getCompiledWriterForSchema(array);

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
      expect([...new Float32Array(arr, i * 16, 3)]).toStrictEqual([
        i * 3,
        i * 3 + 1,
        i * 3 + 2,
      ]);
    }
  });

  it('should compile a writer for a mat4x4f', () => {
    const Schema = d.struct({
      transform: d.mat4x4f,
    });
    const writer = getCompiledWriterForSchema(Schema);

    const arr = new ArrayBuffer(sizeOf(Schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      // deno-fmt-ignore
      transform: d.mat4x4f(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15),
    });

    expect([...new Float32Array(arr)]).toStrictEqual(
      Array.from({ length: 16 }).map((_, i) => i),
    );
  });

  it('should compile a writer for a mat3x3f', () => {
    const Schema = d.struct({
      transform: d.mat3x3f,
    });
    const writer = getCompiledWriterForSchema(Schema);

    const arr = new ArrayBuffer(sizeOf(Schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      transform: d.mat3x3f(0, 1, 2, 3, 4, 5, 6, 7, 8),
    });

    expect(arr.byteLength).toBe(48);
    // deno-fmt-ignore
    expect([...new Float32Array(arr)]).toStrictEqual([0, 1, 2, 0, 3, 4, 5, 0, 6, 7, 8, 0]);
  });

  it('should compile a writer for a mat2x2f', () => {
    const Schema = d.struct({
      transform: d.mat2x2f,
    });
    const writer = getCompiledWriterForSchema(Schema);

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

    const writer = getCompiledWriterForSchema(array);

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

    const writer = getCompiledWriterForSchema(schema);

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

    console.log(tgpu.resolve({ externals: { schema } }));

    const builtWriter = buildWriter(schema, 'offset', 'value');
    expect(builtWriter).toMatchInlineSnapshot(`
      "output.setFloat32((offset + 0), value.a, littleEndian);
      for (let i = 0; i < 2; i++) {
      output.setFloat32(((offset + 64) + i * 4), value.b[i], littleEndian);
      }
      "
    `);

    const writer = getCompiledWriterForSchema(schema);

    console.log(sizeOf(schema));
    console.log(d.alignmentOf(schema));
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

    const writer = getCompiledWriterForSchema(unstruct);

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

    const writer = getCompiledWriterForSchema(disarray);

    const arr = new ArrayBuffer(sizeOf(disarray));
    const dataView = new DataView(arr);

    writer(dataView, 0, [d.vec3f(1, 2, 3), d.vec3f(4, 5, 6), d.vec3f(7, 8, 9)]);

    expect([...new Float32Array(arr)]).toStrictEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
    ]);
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

    const writer = getCompiledWriterForSchema(disarray);

    const arr = new ArrayBuffer(sizeOf(disarray));
    const dataView = new DataView(arr);

    writer(dataView, 0, [
      { a: d.vec3f(1, 2, 3), b: d.vec4f(4, 5, 6, 7) },
      { a: d.vec3f(8, 9, 10), b: d.vec4f(11, 12, 13, 14) },
    ]);

    expect([...new Float32Array(arr)]).toStrictEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
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
      "output.undefined((offset + 0), value.a, littleEndian);
      output.undefined((offset + 4), value.b, littleEndian);
      output.undefined((offset + 8), value.c, littleEndian);
      output.undefined((offset + 10), value.d, littleEndian);
      "
    `);

    const writer = getCompiledWriterForSchema(unstruct);

    const arr = new ArrayBuffer(sizeOf(unstruct));
    const dataView = new DataView(arr);

    writer(dataView, 0, {
      a: d.vec2u(1, 2),
      b: d.vec4f(3, 4, 5, 6),
      c: d.vec2u(7, 8),
      d: d.vec4f(9, 10, 11, 12),
    });

    expect([...new Uint16Array(arr)]).toStrictEqual([
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
    ]);
  });
});
