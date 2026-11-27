import { describe, expect, it } from 'vitest';
import { it as gpuIt } from 'typegpu-testing-utility';
import {
  common,
  d,
  patchArrayBuffer,
  readFromArrayBuffer,
  std,
  tgpu,
  writeToArrayBuffer,
} from 'typegpu';

describe('audit data regressions', () => {
  gpuIt('B12: writeSoA preserves matrix column stride under member alignment', ({ root }) => {
    const schema = d.arrayOf(d.struct({ basis: d.align(32, d.mat3x3f) }), 1);
    const buffer = root.createBuffer(schema);
    common.writeSoA(buffer, { basis: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]) });
    expect([...new Float32Array(buffer.arrayBuffer)]).toEqual([
      1, 2, 3, 0, 4, 5, 6, 0, 7, 8, 9, 0, 0, 0, 0, 0,
    ]);
  });

  it('B13: patchArrayBuffer uses the packed disarray element stride', () => {
    const schema = d.disarrayOf(d.vec3f, 2);
    const buffer = new ArrayBuffer(d.sizeOf(schema));
    patchArrayBuffer(buffer, schema, { 1: d.vec3f(4, 5, 6) });
    expect([...new Float32Array(buffer)]).toEqual([0, 0, 0, 4, 5, 6]);
  });

  it('B14: contiguous ranges stop at padding and the end of the allocation', () => {
    const withArray = d.struct({ points: d.arrayOf(d.vec3f, 2), tail: d.f32 });
    expect.soft(d.memoryLayoutOf(withArray)).toEqual({ offset: 0, contiguous: 12 });
    const withStruct = d.arrayOf(d.struct({ a: d.u32, b: d.vec4u }), 2);
    expect.soft(d.memoryLayoutOf(withStruct)).toEqual({ offset: 0, contiguous: 4 });
    const last = d.memoryLayoutOf(withStruct, (array) => array[1]!.b.z);
    expect.soft(last).toEqual({ offset: 56, contiguous: 8 });
    expect(last.offset + last.contiguous).toBeLessThanOrEqual(d.sizeOf(withStruct));
  });

  it('B15: unorm10_10_10_2 stores red in the least significant ten bits', () => {
    const buffer = new ArrayBuffer(4);
    writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(1, 0, 0, 0));
    expect.soft(new DataView(buffer).getUint32(0, true)).toBe(1023);
    // A round trip alone would also pass if both reader and writer reversed the channels.
    new DataView(buffer).setUint32(0, 1023, true);
    expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2)).toEqual(d.vec4f(1, 0, 0, 0));
  });

  it('B16: pack4x8unorm clamps and rounds each channel', () => {
    expect.soft(std.pack4x8unorm(d.vec4f(0.5))).toBe(0x80808080);
    expect(std.pack4x8unorm(d.vec4f(-1, 2, 0, 1))).toBe(0xff00ff00);
  });

  it('B17: copying mat3 values preserves their elements and creates independent values', () => {
    const basis = d.mat3x3f(1, 2, 3, 4, 5, 6, 7, 8, 9);
    const copied = std.copy(basis);
    expect(copied).toEqual(basis);
    expect(copied).not.toBe(basis);
    expect(d.struct({ basis: d.mat3x3f })({ basis })).toEqual({ basis });
    expect(d.arrayOf(d.mat3x3f, 1)([basis])).toEqual([basis]);
  });

  it('B18: integer vector multiplication preserves the low 32 bits', () => {
    expect(std.mul(d.vec2u(0xffffffff), d.vec2u(0xffffffff))).toEqual(d.vec2u(1));
  });

  it('B19: integer dot products wrap at 32 bits', () => {
    expect(std.dot(d.vec2u(0xffffffff, 0), d.vec2u(2, 0))).toBe(0xfffffffe);
  });

  it('B20: isCloseTo evaluates a side-effecting vector argument once', () => {
    const state = tgpu.privateVar(d.u32, 0).$name('state');
    const next = tgpu
      .fn(
        [],
        d.vec2f,
      )(() => {
        'use gpu';
        state.$ += 1;
        return d.vec2f(d.f32(state.$));
      })
      .$name('next');
    const run = tgpu
      .fn(
        [],
        d.bool,
      )(() => {
        'use gpu';
        return std.isCloseTo(next(), d.vec2f());
      })
      .$name('run');
    const code = tgpu.resolve([run], { names: 'strict' });
    // One function declaration plus one call; duplicated calls mutate state repeatedly.
    expect(code.match(/\bnext\(\)/g)).toHaveLength(2);
  });

  it('B20: isCloseTo includes its tolerance boundary on the CPU', () => {
    expect.soft(std.isCloseTo(0, 1, 1)).toBe(true);
    expect(std.isCloseTo(1, 1, 0)).toBe(true);
  });

  it('B23: texture schema equality distinguishes sample type, format and access', () => {
    expect.soft(d.deepEqual(d.texture2d(d.f32), d.texture2d(d.u32))).toBe(false);
    expect
      .soft(
        d.deepEqual(
          d.textureStorage2d('rgba8unorm', 'read-only'),
          d.textureStorage2d('r32float', 'read-only'),
        ),
      )
      .toBe(false);
    expect(
      d.deepEqual(
        d.textureStorage2d('rgba8unorm', 'read-only'),
        d.textureStorage2d('rgba8unorm', 'write-only'),
      ),
    ).toBe(false);
  });

  it('B58: decorated struct members are copied and zero-initialized', () => {
    const schema = d.struct({ v: d.align(16, d.vec3f), scalar: d.size(16, d.f32) });
    const original = d.vec3f(1, 2, 3);
    const copied = schema({ v: original, scalar: 7 });
    copied.v.x = 99;
    expect.soft(original.x).toBe(1);
    expect(schema()).toEqual({ v: d.vec3f(), scalar: 0 });
  });

  it('B59: a struct nested inside an unstruct round-trips at its packed offset', () => {
    const schema = d.unstruct({ prefix: d.f32, nested: d.struct({ value: d.vec4f }) });
    const value = { prefix: 7, nested: { value: d.vec4f(1, 2, 3, 4) } };
    const buffer = new ArrayBuffer(d.sizeOf(schema));
    expect(buffer.byteLength).toBe(20);
    writeToArrayBuffer(buffer, schema, value);
    expect([...new Float32Array(buffer)]).toEqual([7, 1, 2, 3, 4]);
    expect(readFromArrayBuffer(buffer, schema)).toEqual(value);
  });

  it('B60: matrix translation evaluates a side-effecting argument once', () => {
    const state = tgpu.privateVar(d.u32, 0).$name('state');
    const next = tgpu
      .fn(
        [],
        d.vec3f,
      )(() => {
        'use gpu';
        state.$ += 1;
        return d.vec3f(d.f32(state.$));
      })
      .$name('next');
    const run = tgpu
      .fn(
        [],
        d.mat4x4f,
      )(() => {
        'use gpu';
        return d.mat4x4f.translation(next());
      })
      .$name('run');
    const code = tgpu.resolve([run], { names: 'strict' });
    expect(code.match(/\bnext\(\)/g)).toHaveLength(2);
  });

  it('B60: matrix rotation evaluates a side-effecting argument once', () => {
    const state = tgpu.privateVar(d.f32, 0).$name('state');
    const next = tgpu
      .fn(
        [],
        d.f32,
      )(() => {
        'use gpu';
        state.$ += 1;
        return state.$;
      })
      .$name('next');
    const run = tgpu
      .fn(
        [],
        d.mat4x4f,
      )(() => {
        'use gpu';
        return d.mat4x4f.rotationX(next());
      })
      .$name('run');
    const code = tgpu.resolve([run], { names: 'strict' });
    expect(code.match(/\bnext\(\)/g)).toHaveLength(2);
  });

  it('B61: the minimum signed normalized value decodes to minus one', () => {
    expect
      .soft(readFromArrayBuffer(new Int8Array([-128, -127]).buffer, d.snorm8x2))
      .toEqual(d.vec2f(-1));
    expect(readFromArrayBuffer(new Int16Array([-32768, -32767]).buffer, d.snorm16x2)).toEqual(
      d.vec2f(-1),
    );
  });

  it('B63: sizeOf aligns large struct offsets without signed int32 overflow', () => {
    // Schema arithmetic only: this does not allocate a 2 GiB buffer or require a GPU limit.
    const schema = d.struct({
      data: d.arrayOf(d.u32, 536870912),
      tail: d.f32,
      aligned: d.vec4f,
    });
    expect(d.sizeOf(schema)).toBe(2147483680);
  });
});
