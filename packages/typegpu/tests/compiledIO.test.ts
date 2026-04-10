import { describe, expect } from 'vitest';
import { buildWriter, getCompiledWriterForSchema } from '../src/data/compiledIO.ts';
import * as d from '../src/data/index.ts';
import { sizeOf } from '../src/data/sizeOf.ts';
import { it } from 'typegpu-testing-utility';

describe('buildWriter', () => {
  it('should compile a writer for a struct', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
    });
    const writer = buildWriter(struct, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "output.setUint32((offset + 0), value.a, littleEndian);
      output.setFloat32(((offset + 16) + 0), value.b[0], littleEndian);
      output.setFloat32(((offset + 16) + 4), value.b[1], littleEndian);
      output.setFloat32(((offset + 16) + 8), value.b[2], littleEndian);
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
      if (ArrayBuffer.isView(value.b)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.b.buffer, value.b.byteOffset, Math.min(value.b.byteLength, 32)), output.byteOffset + ((offset + 16)));
      } else {
      for (let i = 0; i < 2; i++) {
      output.setFloat32((((offset + 16) + i * 16) + 0), value.b[i][0], littleEndian);
      output.setFloat32((((offset + 16) + i * 16) + 4), value.b[i][1], littleEndian);
      output.setFloat32((((offset + 16) + i * 16) + 8), value.b[i][2], littleEndian);
      }
      }
      if (ArrayBuffer.isView(value.c)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.c.buffer, value.c.byteOffset, Math.min(value.c.byteLength, 12)), output.byteOffset + ((offset + 48)));
      } else {
      for (let i = 0; i < 3; i++) {
      output.setUint32(((offset + 48) + i * 4), value.c[i], littleEndian);
      }
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
      output.setFloat32((((offset + 16) + 0) + 0), value.b.d[0], littleEndian);
      output.setFloat32((((offset + 16) + 0) + 4), value.b.d[1], littleEndian);
      output.setFloat32((((offset + 16) + 0) + 8), value.b.d[2], littleEndian);
      if (ArrayBuffer.isView(value.c)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.c.buffer, value.c.byteOffset, Math.min(value.c.byteLength, 12)), output.byteOffset + ((offset + 32)));
      } else {
      for (let i = 0; i < 3; i++) {
      output.setUint32((((offset + 32) + i * 4) + 0), value.c[i].d, littleEndian);
      }
      }
      "
    `);
  });
  it('should compile a writer for an array', () => {
    const array = d.arrayOf(d.vec3f, 5);

    const writer = buildWriter(array, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "if (ArrayBuffer.isView(value)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, 80)), output.byteOffset + (offset));
      } else {
      for (let i = 0; i < 5; i++) {
      output.setFloat32(((offset + i * 16) + 0), value[i][0], littleEndian);
      output.setFloat32(((offset + i * 16) + 4), value[i][1], littleEndian);
      output.setFloat32(((offset + i * 16) + 8), value[i][2], littleEndian);
      }
      }
      "
    `);
  });

  it('should compile a writer for nested arrays', () => {
    const nestedArray = d.arrayOf(d.arrayOf(d.u32, 3), 2);

    const writer = buildWriter(nestedArray, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "if (ArrayBuffer.isView(value)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, 24)), output.byteOffset + (offset));
      } else {
      for (let i = 0; i < 2; i++) {
      if (ArrayBuffer.isView(value[i])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i].buffer, value[i].byteOffset, Math.min(value[i].byteLength, 12)), output.byteOffset + ((offset + i * 12)));
      } else {
      for (let j = 0; j < 3; j++) {
      output.setUint32(((offset + i * 12) + j * 4), value[i][j], littleEndian);
      }
      }
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
      if (ArrayBuffer.isView(value.b)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.b.buffer, value.b.byteOffset, Math.min(value.b.byteLength, 32)), output.byteOffset + ((offset + 8)));
      } else {
      for (let i = 0; i < 2; i++) {
      if (ArrayBuffer.isView(value.b[i])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.b[i].buffer, value.b[i].byteOffset, Math.min(value.b[i].byteLength, 16)), output.byteOffset + (((offset + 8) + i * 16)));
      } else {
      for (let j = 0; j < 2; j++) {
      output.setFloat32(((((offset + 8) + i * 16) + j * 8) + 0), value.b[i][j][0], littleEndian);
      output.setFloat32(((((offset + 8) + i * 16) + j * 8) + 4), value.b[i][j][1], littleEndian);
      }
      }
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
      "if (ArrayBuffer.isView(value)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, 131072)), output.byteOffset + (offset));
      } else {
      for (let i = 0; i < 2; i++) {
      if (ArrayBuffer.isView(value[i])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i].buffer, value[i].byteOffset, Math.min(value[i].byteLength, 65536)), output.byteOffset + ((offset + i * 65536)));
      } else {
      for (let j = 0; j < 2; j++) {
      if (ArrayBuffer.isView(value[i][j])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j].buffer, value[i][j].byteOffset, Math.min(value[i][j].byteLength, 32768)), output.byteOffset + (((offset + i * 65536) + j * 32768)));
      } else {
      for (let k = 0; k < 2; k++) {
      if (ArrayBuffer.isView(value[i][j][k])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k].buffer, value[i][j][k].byteOffset, Math.min(value[i][j][k].byteLength, 16384)), output.byteOffset + ((((offset + i * 65536) + j * 32768) + k * 16384)));
      } else {
      for (let i3 = 0; i3 < 2; i3++) {
      if (ArrayBuffer.isView(value[i][j][k][i3])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3].buffer, value[i][j][k][i3].byteOffset, Math.min(value[i][j][k][i3].byteLength, 8192)), output.byteOffset + (((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192)));
      } else {
      for (let i4 = 0; i4 < 2; i4++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4].buffer, value[i][j][k][i3][i4].byteOffset, Math.min(value[i][j][k][i3][i4].byteLength, 4096)), output.byteOffset + ((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096)));
      } else {
      for (let i5 = 0; i5 < 2; i5++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4][i5])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4][i5].buffer, value[i][j][k][i3][i4][i5].byteOffset, Math.min(value[i][j][k][i3][i4][i5].byteLength, 2048)), output.byteOffset + (((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048)));
      } else {
      for (let i6 = 0; i6 < 2; i6++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4][i5][i6])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4][i5][i6].buffer, value[i][j][k][i3][i4][i5][i6].byteOffset, Math.min(value[i][j][k][i3][i4][i5][i6].byteLength, 1024)), output.byteOffset + ((((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048) + i6 * 1024)));
      } else {
      for (let i7 = 0; i7 < 2; i7++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4][i5][i6][i7])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4][i5][i6][i7].buffer, value[i][j][k][i3][i4][i5][i6][i7].byteOffset, Math.min(value[i][j][k][i3][i4][i5][i6][i7].byteLength, 512)), output.byteOffset + (((((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048) + i6 * 1024) + i7 * 512)));
      } else {
      for (let i8 = 0; i8 < 2; i8++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4][i5][i6][i7][i8])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4][i5][i6][i7][i8].buffer, value[i][j][k][i3][i4][i5][i6][i7][i8].byteOffset, Math.min(value[i][j][k][i3][i4][i5][i6][i7][i8].byteLength, 256)), output.byteOffset + ((((((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048) + i6 * 1024) + i7 * 512) + i8 * 256)));
      } else {
      for (let i9 = 0; i9 < 2; i9++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4][i5][i6][i7][i8][i9])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4][i5][i6][i7][i8][i9].buffer, value[i][j][k][i3][i4][i5][i6][i7][i8][i9].byteOffset, Math.min(value[i][j][k][i3][i4][i5][i6][i7][i8][i9].byteLength, 128)), output.byteOffset + (((((((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048) + i6 * 1024) + i7 * 512) + i8 * 256) + i9 * 128)));
      } else {
      for (let i10 = 0; i10 < 2; i10++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10].buffer, value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10].byteOffset, Math.min(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10].byteLength, 64)), output.byteOffset + ((((((((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048) + i6 * 1024) + i7 * 512) + i8 * 256) + i9 * 128) + i10 * 64)));
      } else {
      for (let i11 = 0; i11 < 2; i11++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11].buffer, value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11].byteOffset, Math.min(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11].byteLength, 32)), output.byteOffset + (((((((((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048) + i6 * 1024) + i7 * 512) + i8 * 256) + i9 * 128) + i10 * 64) + i11 * 32)));
      } else {
      for (let i12 = 0; i12 < 2; i12++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11][i12])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11][i12].buffer, value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11][i12].byteOffset, Math.min(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11][i12].byteLength, 16)), output.byteOffset + ((((((((((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048) + i6 * 1024) + i7 * 512) + i8 * 256) + i9 * 128) + i10 * 64) + i11 * 32) + i12 * 16)));
      } else {
      for (let i13 = 0; i13 < 2; i13++) {
      if (ArrayBuffer.isView(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11][i12][i13])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11][i12][i13].buffer, value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11][i12][i13].byteOffset, Math.min(value[i][j][k][i3][i4][i5][i6][i7][i8][i9][i10][i11][i12][i13].byteLength, 8)), output.byteOffset + (((((((((((((((offset + i * 65536) + j * 32768) + k * 16384) + i3 * 8192) + i4 * 4096) + i5 * 2048) + i6 * 1024) + i7 * 512) + i8 * 256) + i9 * 128) + i10 * 64) + i11 * 32) + i12 * 16) + i13 * 8)));
      } else {
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

describe('buildWriter (partial mode)', () => {
  it('should compile a partial writer for a struct', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
    });
    const writer = buildWriter(struct, 'offset', 'value', 0, true);

    expect(writer).toMatchInlineSnapshot(`
      "if ((offset + 0) < endOffset) { output.setUint32((offset + 0), value.a, littleEndian); }
      if (((offset + 16) + 0) < endOffset) { output.setFloat32(((offset + 16) + 0), value.b[0], littleEndian); }
      if (((offset + 16) + 4) < endOffset) { output.setFloat32(((offset + 16) + 4), value.b[1], littleEndian); }
      if (((offset + 16) + 8) < endOffset) { output.setFloat32(((offset + 16) + 8), value.b[2], littleEndian); }
      "
    `);
  });

  it('should compile a partial writer for a struct with an array', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 2),
      c: d.arrayOf(d.u32, 3),
    });
    const writer = buildWriter(struct, 'offset', 'value', 0, true);

    expect(writer).toMatchInlineSnapshot(`
      "if ((offset + 0) < endOffset) { output.setUint32((offset + 0), value.a, littleEndian); }
      if (ArrayBuffer.isView(value.b)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.b.buffer, value.b.byteOffset, Math.min(value.b.byteLength, Math.max(0, endOffset - ((offset + 16))))), output.byteOffset + ((offset + 16)));
      } else {
      for (let i = 0; i < 2; i++) {
      if (((offset + 16) + i * 16) >= endOffset) return;
      if ((((offset + 16) + i * 16) + 0) < endOffset) { output.setFloat32((((offset + 16) + i * 16) + 0), value.b[i][0], littleEndian); }
      if ((((offset + 16) + i * 16) + 4) < endOffset) { output.setFloat32((((offset + 16) + i * 16) + 4), value.b[i][1], littleEndian); }
      if ((((offset + 16) + i * 16) + 8) < endOffset) { output.setFloat32((((offset + 16) + i * 16) + 8), value.b[i][2], littleEndian); }
      }
      }
      if (ArrayBuffer.isView(value.c)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.c.buffer, value.c.byteOffset, Math.min(value.c.byteLength, Math.max(0, endOffset - ((offset + 48))))), output.byteOffset + ((offset + 48)));
      } else {
      for (let i = 0; i < 3; i++) {
      if (((offset + 48) + i * 4) >= endOffset) return;
      if (((offset + 48) + i * 4) < endOffset) { output.setUint32(((offset + 48) + i * 4), value.c[i], littleEndian); }
      }
      }
      "
    `);
  });

  it('should compile a partial writer for an array of u16', () => {
    const array = d.arrayOf(d.u16, 5);

    const builtWriter = buildWriter(array, 'offset', 'value', 0, true);
    expect(builtWriter).toMatchInlineSnapshot(`
      "if (ArrayBuffer.isView(value)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, Math.max(0, endOffset - (offset)))), output.byteOffset + (offset));
      } else {
      for (let i = 0; i < 5; i++) {
      if ((offset + i * 2) >= endOffset) return;
      if ((offset + i * 2) < endOffset) { output.setUint16((offset + i * 2), value[i], littleEndian); }
      }
      }
      "
    `);
  });

  it('should compile a partial writer for unstruct with loose data', () => {
    const unstruct = d.unstruct({
      a: d.uint16x2,
      b: d.unorm10_10_10_2,
      c: d.uint8x2,
      d: d.unorm8x4,
    });

    const unstructWriter = buildWriter(unstruct, 'offset', 'value', 0, true);
    expect(unstructWriter).toMatchInlineSnapshot(`
      "if (((offset + 0) + 0) < endOffset) { output.setUint16(((offset + 0) + 0), value.a.x, littleEndian); }
      if (((offset + 0) + 2) < endOffset) { output.setUint16(((offset + 0) + 2), value.a.y, littleEndian); }
      if (((offset + 4)) < endOffset) {
      output.setUint32((offset + 4), ((value.b.x*1023&0x3FF)<<22)|((value.b.y*1023&0x3FF)<<12)|((value.b.z*1023&0x3FF)<<2)|(value.b.w*3&3), littleEndian);
      }
      if (((offset + 8) + 0) < endOffset) { output.setUint8(((offset + 8) + 0), value.c.x, littleEndian); }
      if (((offset + 8) + 1) < endOffset) { output.setUint8(((offset + 8) + 1), value.c.y, littleEndian); }
      if (((offset + 10) + 0) < endOffset) { output.setUint8(((offset + 10) + 0), Math.round(value.d.x * 255), littleEndian); }
      if (((offset + 10) + 1) < endOffset) { output.setUint8(((offset + 10) + 1), Math.round(value.d.y * 255), littleEndian); }
      if (((offset + 10) + 2) < endOffset) { output.setUint8(((offset + 10) + 2), Math.round(value.d.z * 255), littleEndian); }
      if (((offset + 10) + 3) < endOffset) { output.setUint8(((offset + 10) + 3), Math.round(value.d.w * 255), littleEndian); }
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
      "if (ArrayBuffer.isView(value)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, 256)), output.byteOffset + (offset));
      } else {
      for (let i = 0; i < 2; i++) {
      if (ArrayBuffer.isView(value[i])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i].buffer, value[i].byteOffset, Math.min(value[i].byteLength, 128)), output.byteOffset + ((offset + i * 128)));
      } else {
      for (let j = 0; j < 2; j++) {
      if (ArrayBuffer.isView(value[i][j])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j].buffer, value[i][j].byteOffset, Math.min(value[i][j].byteLength, 64)), output.byteOffset + (((offset + i * 128) + j * 64)));
      } else {
      for (let k = 0; k < 2; k++) {
      if (ArrayBuffer.isView(value[i][j][k])) {
        new Uint8Array(output.buffer).set(new Uint8Array(value[i][j][k].buffer, value[i][j][k].byteOffset, Math.min(value[i][j][k].byteLength, 32)), output.byteOffset + ((((offset + i * 128) + j * 64) + k * 32)));
      } else {
      for (let i3 = 0; i3 < 2; i3++) {
      output.setFloat32((((((offset + i * 128) + j * 64) + k * 32) + i3 * 16) + 0), value[i][j][k][i3][0], littleEndian);
      output.setFloat32((((((offset + i * 128) + j * 64) + k * 32) + i3 * 16) + 4), value[i][j][k][i3][1], littleEndian);
      output.setFloat32((((((offset + i * 128) + j * 64) + k * 32) + i3 * 16) + 8), value[i][j][k][i3][2], littleEndian);
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

  it('should stop writing elements at the given endOffset', () => {
    const schema = d.arrayOf(d.vec3u, 4);
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);
    const endLayout = d.memoryLayoutOf(schema, (a) => a[2]);

    writer(dataView, 0, [d.vec3u(1, 2, 3), d.vec3u(4, 5, 6)], true, endLayout.offset);

    expect([...new Uint32Array(arr)]).toStrictEqual([
      1, 2, 3, 0, 4, 5, 6, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it('should write a padded array chunk from the beginning offset through the end when endOffset is omitted', () => {
    const schema = d.arrayOf(d.vec3u, 4);
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);
    const layout = d.memoryLayoutOf(schema, (a) => a[1]?.x);

    writer(
      dataView,
      layout.offset,
      [d.vec3u(4, 5, 6), d.vec3u(7, 8, 9), d.vec3u(10, 11, 12)],
      true,
    );

    expect([...new Uint32Array(arr)]).toStrictEqual([
      0, 0, 0, 0, 4, 5, 6, 0, 7, 8, 9, 0, 10, 11, 12, 0,
    ]);
  });

  it('should write a scalar array chunk from the beginning offset through the end when endOffset is omitted', () => {
    const schema = d.arrayOf(d.u32, 6);
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);
    const layout = d.memoryLayoutOf(schema, (a) => a[3]);

    writer(dataView, layout.offset, [4, 5, 6], true);

    expect([...new Uint32Array(arr)]).toStrictEqual([0, 0, 0, 4, 5, 6]);
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
      if (ArrayBuffer.isView(value.b)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.b.buffer, value.b.byteOffset, Math.min(value.b.byteLength, 8)), output.byteOffset + ((offset + 16)));
      } else {
      for (let i = 0; i < 2; i++) {
      output.setFloat32(((offset + 16) + i * 4), value.b[i], littleEndian);
      }
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
      if (ArrayBuffer.isView(value.b)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.b.buffer, value.b.byteOffset, Math.min(value.b.byteLength, 8)), output.byteOffset + ((offset + 64)));
      } else {
      for (let i = 0; i < 2; i++) {
      output.setFloat32(((offset + 64) + i * 4), value.b[i], littleEndian);
      }
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
      "output.setFloat32(((offset + 0) + 0), value.a[0], littleEndian);
      output.setFloat32(((offset + 0) + 4), value.a[1], littleEndian);
      output.setFloat32(((offset + 0) + 8), value.a[2], littleEndian);
      output.setFloat32(((offset + 12) + 0), value.b[0], littleEndian);
      output.setFloat32(((offset + 12) + 4), value.b[1], littleEndian);
      output.setFloat32(((offset + 12) + 8), value.b[2], littleEndian);
      output.setFloat32(((offset + 12) + 12), value.b[3], littleEndian);
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
      "if (ArrayBuffer.isView(value)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, 36)), output.byteOffset + (offset));
      } else {
      for (let i = 0; i < 3; i++) {
      output.setFloat32(((offset + i * 12) + 0), value[i][0], littleEndian);
      output.setFloat32(((offset + i * 12) + 4), value[i][1], littleEndian);
      output.setFloat32(((offset + i * 12) + 8), value[i][2], littleEndian);
      }
      }
      "
    `);

    const writer = getCompiledWriterForSchema(disarray)!;

    const arr = new ArrayBuffer(sizeOf(disarray));
    const dataView = new DataView(arr);

    writer(dataView, 0, [d.vec3f(1, 2, 3), d.vec3f(4, 5, 6), d.vec3f(7, 8, 9)]);

    expect([...new Float32Array(arr)]).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('should compile a writer for a vec3h with 2-byte component offsets', () => {
    const writer = buildWriter(d.vec3h, 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "output.setFloat16((offset + 0), value[0], littleEndian);
      output.setFloat16((offset + 2), value[1], littleEndian);
      output.setFloat16((offset + 4), value[2], littleEndian);
      "
    `);
  });

  it('should compile a writer for an array of vec3h with 2-byte component offsets', () => {
    const writer = buildWriter(d.arrayOf(d.vec3h, 2), 'offset', 'value');

    expect(writer).toMatchInlineSnapshot(`
      "if (ArrayBuffer.isView(value)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, 16)), output.byteOffset + (offset));
      } else {
      for (let i = 0; i < 2; i++) {
      output.setFloat16(((offset + i * 8) + 0), value[i][0], littleEndian);
      output.setFloat16(((offset + i * 8) + 2), value[i][1], littleEndian);
      output.setFloat16(((offset + i * 8) + 4), value[i][2], littleEndian);
      }
      }
      "
    `);
  });

  it('should compile for a disarray of unstructs', () => {
    const unstruct = d.unstruct({
      a: d.vec3f,
      b: d.vec4f,
    });
    const disarray = d.disarrayOf(unstruct, 2);

    const builtWriter = buildWriter(disarray, 'offset', 'value');
    expect(builtWriter).toMatchInlineSnapshot(`
      "if (ArrayBuffer.isView(value)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, 56)), output.byteOffset + (offset));
      } else {
      for (let i = 0; i < 2; i++) {
      output.setFloat32((((offset + i * 28) + 0) + 0), value[i].a[0], littleEndian);
      output.setFloat32((((offset + i * 28) + 0) + 4), value[i].a[1], littleEndian);
      output.setFloat32((((offset + i * 28) + 0) + 8), value[i].a[2], littleEndian);
      output.setFloat32((((offset + i * 28) + 12) + 0), value[i].b[0], littleEndian);
      output.setFloat32((((offset + i * 28) + 12) + 4), value[i].b[1], littleEndian);
      output.setFloat32((((offset + i * 28) + 12) + 8), value[i].b[2], littleEndian);
      output.setFloat32((((offset + i * 28) + 12) + 12), value[i].b[3], littleEndian);
      }
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

  it('should write a vec3f from a plain tuple', () => {
    const schema = d.vec3f;
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(16);
    const dataView = new DataView(arr);

    writer(dataView, 0, [1, 2, 3]);

    expect([...new Float32Array(arr, 0, 3)]).toStrictEqual([1, 2, 3]);
  });

  it('should write a vec3f from a Float32Array', () => {
    const schema = d.vec3f;
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(16);
    const dataView = new DataView(arr);

    writer(dataView, 0, new Float32Array([1, 2, 3]));

    expect([...new Float32Array(arr, 0, 3)]).toStrictEqual([1, 2, 3]);
  });

  it('should write a mat3x3f from a packed number[]', () => {
    const schema = d.mat3x3f;
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8]);

    expect(arr.byteLength).toBe(48);
    expect([...new Float32Array(arr)]).toStrictEqual([0, 1, 2, 0, 3, 4, 5, 0, 6, 7, 8, 0]);
  });

  it('should write a mat3x3f from a padded Float32Array', () => {
    const schema = d.mat3x3f;
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, new Float32Array([0, 1, 2, 0, 3, 4, 5, 0, 6, 7, 8, 0]));

    expect(arr.byteLength).toBe(48);
    expect([...new Float32Array(arr)]).toStrictEqual([0, 1, 2, 0, 3, 4, 5, 0, 6, 7, 8, 0]);
  });

  it('should write a mat4x4f from a Float32Array', () => {
    const schema = d.mat4x4f;
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, new Float32Array(Array.from({ length: 16 }).map((_, i) => i)));

    expect([...new Float32Array(arr)]).toStrictEqual(Array.from({ length: 16 }).map((_, i) => i));
  });

  it('should write an array of vec3f from plain tuples', () => {
    const schema = d.arrayOf(d.vec3f, 3);
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);

    expect([...new Float32Array(arr, 0, 3)]).toStrictEqual([1, 2, 3]);
    expect([...new Float32Array(arr, 16, 3)]).toStrictEqual([4, 5, 6]);
    expect([...new Float32Array(arr, 32, 3)]).toStrictEqual([7, 8, 9]);
  });

  it('should write an array of vec3f from a padded Float32Array (raw bytes, 16-byte stride)', () => {
    const schema = d.arrayOf(d.vec3f, 3);
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, new Float32Array([1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0]));

    expect([...new Float32Array(arr, 0, 3)]).toStrictEqual([1, 2, 3]);
    expect([...new Float32Array(arr, 16, 3)]).toStrictEqual([4, 5, 6]);
    expect([...new Float32Array(arr, 32, 3)]).toStrictEqual([7, 8, 9]);
  });

  it('should write an array of vec3f where each element is its own Float32Array', () => {
    const schema = d.arrayOf(d.vec3f, 3);
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    const sharedBuffer = new ArrayBuffer(36);
    const v0 = new Float32Array(sharedBuffer, 0, 3);
    const v1 = new Float32Array(sharedBuffer, 12, 3);
    const v2 = new Float32Array(sharedBuffer, 24, 3);
    v0.set([1, 2, 3]);
    v1.set([4, 5, 6]);
    v2.set([7, 8, 9]);

    writer(dataView, 0, [v0, v1, v2]);

    expect([...new Float32Array(arr, 0, 3)]).toStrictEqual([1, 2, 3]);
    expect([...new Float32Array(arr, 16, 3)]).toStrictEqual([4, 5, 6]);
    expect([...new Float32Array(arr, 32, 3)]).toStrictEqual([7, 8, 9]);
  });

  it('should write a vec3h from a plain tuple with correct 2-byte component offsets', () => {
    const schema = d.vec3h;
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(8);
    const dataView = new DataView(arr);

    writer(dataView, 0, [1.5, 2.5, 3.5]);

    expect(dataView.getFloat16(0, true)).toBeCloseTo(1.5);
    expect(dataView.getFloat16(2, true)).toBeCloseTo(2.5);
    expect(dataView.getFloat16(4, true)).toBeCloseTo(3.5);
  });

  it('should write an arrayOf(vec3h) from plain tuples with stride-corrected 2-byte offsets', () => {
    const schema = d.arrayOf(d.vec3h, 2);
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, [
      [1, 2, 3],
      [4, 5, 6],
    ]);

    expect(dataView.getFloat16(0, true)).toBeCloseTo(1);
    expect(dataView.getFloat16(2, true)).toBeCloseTo(2);
    expect(dataView.getFloat16(4, true)).toBeCloseTo(3);
    expect(dataView.getFloat16(8, true)).toBeCloseTo(4);
    expect(dataView.getFloat16(10, true)).toBeCloseTo(5);
    expect(dataView.getFloat16(12, true)).toBeCloseTo(6);
  });

  it('should write an array of f32 scalars from a Float32Array', () => {
    const schema = d.arrayOf(d.f32, 4);
    const writer = getCompiledWriterForSchema(schema)!;
    const arr = new ArrayBuffer(sizeOf(schema));
    const dataView = new DataView(arr);

    writer(dataView, 0, new Float32Array([1.5, 2.5, 3.5, 4.5]));

    expect([...new Float32Array(arr)]).toStrictEqual([1.5, 2.5, 3.5, 4.5]);
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
      "if (ArrayBuffer.isView(value)) {
        new Uint8Array(output.buffer).set(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, 44)), output.byteOffset + (offset));
      } else {
      for (let i = 0; i < 2; i++) {
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

  it('should write a nested struct with TypedArray array fields interleaved with normal fields', () => {
    const inner = d.struct({
      scalar: d.u32,
      vecs: d.arrayOf(d.vec4f, 2),
    });

    const outer = d.struct({
      label: d.u32,
      inner: inner,
      scalars: d.arrayOf(d.f32, 4),
      padded: d.arrayOf(d.vec3f, 2),
    });

    const writer = getCompiledWriterForSchema(outer)!;
    const arr = new ArrayBuffer(sizeOf(outer));
    const dataView = new DataView(arr);

    const vecsData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const paddedData = new Float32Array([10, 20, 30, 0, 40, 50, 60, 0]);

    writer(dataView, 0, {
      label: 99,
      inner: { scalar: 7, vecs: vecsData },
      scalars: [1.5, 2.5, 3.5, 4.5],
      padded: paddedData,
    });

    expect(new Uint32Array(arr, 0, 1)[0]).toBe(99);
    const innerOffset = 16;
    expect(new Uint32Array(arr, innerOffset, 1)[0]).toBe(7);
    const vecsOffset = innerOffset + 16;
    expect([...new Float32Array(arr, vecsOffset, 4)]).toStrictEqual([1, 2, 3, 4]);
    expect([...new Float32Array(arr, vecsOffset + 16, 4)]).toStrictEqual([5, 6, 7, 8]);
    const scalarsOffset = innerOffset + sizeOf(inner);
    expect([...new Float32Array(arr, scalarsOffset, 4)]).toStrictEqual([1.5, 2.5, 3.5, 4.5]);
    const paddedOffset = scalarsOffset + 16;
    expect([...new Float32Array(arr, paddedOffset, 3)]).toStrictEqual([10, 20, 30]);
    expect([...new Float32Array(arr, paddedOffset + 16, 3)]).toStrictEqual([40, 50, 60]);
  });
});
