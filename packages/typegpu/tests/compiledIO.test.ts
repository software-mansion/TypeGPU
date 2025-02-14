import { describe, expect } from 'vitest';
import * as d from '../src/data';
import {
  type CompiledWriteInstructions,
  createCompileInstructions,
  getCompiledWriterForSchema,
} from '../src/data/compiledIO';
import { sizeOf } from '../src/data/sizeOf';
import { it } from './utils/extendedIt';

describe('createCompileInstructions', () => {
  it('should compile a writer for a struct', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.vec3f,
    });

    const instructions = createCompileInstructions(struct);
    expect(instructions).toHaveLength(4);

    const [f1, f2x, f2y, f2z] = instructions;

    if (!f1 || !f2x || !f2y || !f2z) {
      throw new Error('Invalid instructions');
    }

    expect(f1.offset).toBe(0);
    expect(f1.primitive).toBe('u32');
    expect(f1.path).toStrictEqual(['a']);

    expect(f2x.offset).toBe(16);
    expect(f2x.primitive).toBe('f32');
    expect(f2x.path).toStrictEqual(['b', 'x']);

    expect(f2y.offset).toBe(20);
    expect(f2y.primitive).toBe('f32');
    expect(f2y.path).toStrictEqual(['b', 'y']);

    expect(f2z.offset).toBe(24);
    expect(f2z.primitive).toBe('f32');
    expect(f2z.path).toStrictEqual(['b', 'z']);
  });

  it('should compile a writer for a struct with an array', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.arrayOf(d.vec3f, 2),
      c: d.arrayOf(d.u32, 3),
    });

    const instructions = createCompileInstructions(struct);
    expect(instructions).toHaveLength(10);

    const [f1, f2x, f2y, f2z, f3x, f3y, f3z, f4, f5, f6] = instructions;

    if (
      !f1 ||
      !f2x ||
      !f2y ||
      !f2z ||
      !f3x ||
      !f3y ||
      !f3z ||
      !f4 ||
      !f5 ||
      !f6
    ) {
      throw new Error('Invalid instructions');
    }

    expect(f1.offset).toBe(0);
    expect(f1.primitive).toBe('u32');
    expect(f1.path).toStrictEqual(['a']);

    expect(f2x.offset).toBe(16);
    expect(f2x.primitive).toBe('f32');
    expect(f2x.path).toStrictEqual(['b[0]', 'x']);

    expect(f2y.offset).toBe(20);
    expect(f2y.primitive).toBe('f32');
    expect(f2y.path).toStrictEqual(['b[0]', 'y']);

    expect(f2z.offset).toBe(24);
    expect(f2z.primitive).toBe('f32');
    expect(f2z.path).toStrictEqual(['b[0]', 'z']);

    expect(f3x.offset).toBe(32);
    expect(f3x.primitive).toBe('f32');
    expect(f3x.path).toStrictEqual(['b[1]', 'x']);

    expect(f3y.offset).toBe(36);
    expect(f3y.primitive).toBe('f32');
    expect(f3y.path).toStrictEqual(['b[1]', 'y']);

    expect(f3z.offset).toBe(40);
    expect(f3z.primitive).toBe('f32');
    expect(f3z.path).toStrictEqual(['b[1]', 'z']);

    expect(f4.offset).toBe(48);
    expect(f4.primitive).toBe('u32');
    expect(f4.path).toStrictEqual(['c[0]']);

    expect(f5.offset).toBe(52);
    expect(f5.primitive).toBe('u32');
    expect(f5.path).toStrictEqual(['c[1]']);

    expect(f6.offset).toBe(56);
    expect(f6.primitive).toBe('u32');
    expect(f6.path).toStrictEqual(['c[2]']);
  });

  it('should compile a writer for a struct with nested structs', () => {
    const struct = d.struct({
      a: d.u32,
      b: d.struct({
        d: d.vec3f,
      }),
      c: d.arrayOf(d.struct({ d: d.u32 }), 3),
    });

    const instructions = createCompileInstructions(struct);
    expect(instructions).toHaveLength(7);

    const [f1, f2x, f2y, f2z, f3, f4, f5] = instructions;

    if (!f1 || !f2x || !f2y || !f2z || !f3 || !f4 || !f5) {
      throw new Error('Invalid instructions');
    }

    expect(f1.offset).toBe(0);
    expect(f1.primitive).toBe('u32');
    expect(f1.path).toStrictEqual(['a']);

    expect(f2x.offset).toBe(16);
    expect(f2x.primitive).toBe('f32');
    expect(f2x.path).toStrictEqual(['b', 'd', 'x']);

    expect(f2y.offset).toBe(20);
    expect(f2y.primitive).toBe('f32');
    expect(f2y.path).toStrictEqual(['b', 'd', 'y']);

    expect(f2z.offset).toBe(24);
    expect(f2z.primitive).toBe('f32');
    expect(f2z.path).toStrictEqual(['b', 'd', 'z']);

    expect(f3.offset).toBe(32);
    expect(f3.primitive).toBe('u32');
    expect(f3.path).toStrictEqual(['c[0]', 'd']);

    expect(f4.offset).toBe(36);
    expect(f4.primitive).toBe('u32');
    expect(f4.path).toStrictEqual(['c[1]', 'd']);

    expect(f5.offset).toBe(40);
    expect(f5.primitive).toBe('u32');
    expect(f5.path).toStrictEqual(['c[2]', 'd']);
  });

  it('should compile a writer for an array', () => {
    const array = d.arrayOf(d.vec3f, 5);

    const instructions = createCompileInstructions(array);

    expect(instructions).toHaveLength(15);

    for (let i = 0; i < 5; i++) {
      expect((instructions[i * 3] as CompiledWriteInstructions).offset).toBe(
        i * 16,
      );
      expect((instructions[i * 3] as CompiledWriteInstructions).primitive).toBe(
        'f32',
      );
      expect(
        (instructions[i * 3] as CompiledWriteInstructions).path,
      ).toStrictEqual([`[${i}]`, 'x']);

      expect(
        (instructions[i * 3 + 1] as CompiledWriteInstructions).offset,
      ).toBe(i * 16 + 4);
      expect(
        (instructions[i * 3 + 1] as CompiledWriteInstructions).primitive,
      ).toBe('f32');
      expect(
        (instructions[i * 3 + 1] as CompiledWriteInstructions).path,
      ).toStrictEqual([`[${i}]`, 'y']);

      expect(
        (instructions[i * 3 + 2] as CompiledWriteInstructions).offset,
      ).toBe(i * 16 + 8);
      expect(
        (instructions[i * 3 + 2] as CompiledWriteInstructions).primitive,
      ).toBe('f32');
      expect(
        (instructions[i * 3 + 2] as CompiledWriteInstructions).path,
      ).toStrictEqual([`[${i}]`, 'z']);
    }
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
    expect([...new Float32Array(arr, 16, 3)]).toEqual([1, 2, 3]);
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
    expect([...new Float32Array(arr, 16, 3)]).toEqual([1, 2, 3]);
    expect([...new Float32Array(arr, 32, 3)]).toEqual([4, 5, 6]);
    expect([...new Uint32Array(arr, 48, 3)]).toEqual([1, 2, 3]);
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
    expect([...new Float32Array(arr, 16, 3)]).toEqual([1, 2, 3]);
    expect([...new Uint32Array(arr, 32, 3)]).toEqual([1, 2, 3]);
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
      expect([...new Float32Array(arr, i * 16, 3)]).toEqual([
        i * 3,
        i * 3 + 1,
        i * 3 + 2,
      ]);
    }
  });
});
