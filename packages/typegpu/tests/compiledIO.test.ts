import { describe, expect } from 'vitest';
import {
  buildWriter,
  getCompiledWriterForSchema,
} from '../src/data/compiledIO.ts';
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
});
