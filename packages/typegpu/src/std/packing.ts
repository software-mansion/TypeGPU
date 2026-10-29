import * as TB from 'typed-binary';
import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { u32 } from '../data/numeric.ts';
import { clampScalar } from '../data/numberOps.ts';
import { vec2f, vec4f, vec4i, vec4u } from '../data/vector.ts';
import type { v2f, v4f, v4i, v4u } from '../data/wgslTypes.ts';
import { readFloat16, writeFloat16 } from '../data/float16Conversion.ts';

const packed = TB.cursor(new ArrayBuffer(4), { endianness: 'little' });

function readPacked(value: number): TB.ByteCursor {
  packed.offset = 0;
  TB.u32.write(packed, value);
  packed.offset = 0;
  return packed;
}

function writePacked(write: (writer: TB.ByteCursor) => void): number {
  packed.offset = 0;
  write(packed);
  packed.offset = 0;
  return u32(TB.u32.read(packed));
}

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#unpack2x16float-builtin
 */
export const unpack2x16float = dualImpl({
  name: 'unpack2x16float',
  normalImpl: (e: number): v2f => {
    const reader = readPacked(e);
    return vec2f(readFloat16(reader), readFloat16(reader));
  },
  signature: { argTypes: [u32], returnType: vec2f },
  codegenImpl: (_ctx, [e]) => stitch`unpack2x16float(${e})`,
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#pack2x16float-builtin
 */
export const pack2x16float = dualImpl({
  name: 'pack2x16float',
  normalImpl: (e: v2f): number =>
    writePacked((writer) => {
      writeFloat16(writer, e.x);
      writeFloat16(writer, e.y);
    }),
  signature: { argTypes: [vec2f], returnType: u32 },
  codegenImpl: (_ctx, [e]) => stitch`pack2x16float(${e})`,
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#pack2x16snorm-builtin
 */
export const pack2x16snorm = dualImpl({
  name: 'pack2x16snorm',
  normalImpl: (e: v2f): number => {
    const x = Math.floor(0.5 + 32767 * clampScalar(e.x, -1, 1));
    const y = Math.floor(0.5 + 32767 * clampScalar(e.y, -1, 1));
    return writePacked((writer) => {
      TB.i16.write(writer, x);
      TB.i16.write(writer, y);
    });
  },
  signature: { argTypes: [vec2f], returnType: u32 },
  codegenImpl: (_ctx, [e]) => stitch`pack2x16snorm(${e})`,
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#pack2x16unorm-builtin
 */
export const pack2x16unorm = dualImpl({
  name: 'pack2x16unorm',
  normalImpl: (e: v2f): number => {
    const x = Math.floor(0.5 + 65535 * clampScalar(e.x, 0, 1));
    const y = Math.floor(0.5 + 65535 * clampScalar(e.y, 0, 1));
    return writePacked((writer) => {
      TB.u16.write(writer, x);
      TB.u16.write(writer, y);
    });
  },
  signature: { argTypes: [vec2f], returnType: u32 },
  codegenImpl: (_ctx, [e]) => stitch`pack2x16unorm(${e})`,
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#unpack4x8unorm-builtin
 */
export const unpack4x8unorm = dualImpl({
  name: 'unpack4x8unorm',
  normalImpl: (e: number): v4f => {
    const reader = readPacked(e);
    return vec4f(
      TB.u8.read(reader) / 255,
      TB.u8.read(reader) / 255,
      TB.u8.read(reader) / 255,
      TB.u8.read(reader) / 255,
    );
  },
  signature: { argTypes: [u32], returnType: vec4f },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('unpack4x8unorm', [], [e]),
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#unpack4x8snorm-builtin
 */
export const unpack4x8snorm = dualImpl({
  name: 'unpack4x8snorm',
  normalImpl: (e: number): v4f => {
    const reader = readPacked(e);
    return vec4f(
      Math.max(TB.i8.read(reader) / 127, -1),
      Math.max(TB.i8.read(reader) / 127, -1),
      Math.max(TB.i8.read(reader) / 127, -1),
      Math.max(TB.i8.read(reader) / 127, -1),
    );
  },
  signature: { argTypes: [u32], returnType: vec4f },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('unpack4x8snorm', [], [e]),
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#unpack4xi8-builtin
 */
export const unpack4xI8 = dualImpl({
  name: 'unpack4xI8',
  normalImpl: (e: number): v4i => {
    const reader = readPacked(e);
    return vec4i(TB.i8.read(reader), TB.i8.read(reader), TB.i8.read(reader), TB.i8.read(reader));
  },
  signature: { argTypes: [u32], returnType: vec4i },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('unpack4xI8', [], [e]),
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#unpack4xu8-builtin
 */
export const unpack4xU8 = dualImpl({
  name: 'unpack4xU8',
  normalImpl: (e: number): v4u => {
    const reader = readPacked(e);
    return vec4u(TB.u8.read(reader), TB.u8.read(reader), TB.u8.read(reader), TB.u8.read(reader));
  },
  signature: { argTypes: [u32], returnType: vec4u },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('unpack4xU8', [], [e]),
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#unpack2x16snorm-builtin
 */
export const unpack2x16snorm = dualImpl({
  name: 'unpack2x16snorm',
  normalImpl: (e: number): v2f => {
    const reader = readPacked(e);
    return vec2f(
      Math.max(TB.i16.read(reader) / 32767, -1),
      Math.max(TB.i16.read(reader) / 32767, -1),
    );
  },
  signature: { argTypes: [u32], returnType: vec2f },
  codegenImpl: (_ctx, [e]) => stitch`unpack2x16snorm(${e})`,
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#unpack2x16unorm-builtin
 */
export const unpack2x16unorm = dualImpl({
  name: 'unpack2x16unorm',
  normalImpl: (e: number): v2f => {
    const reader = readPacked(e);
    return vec2f(TB.u16.read(reader) / 65535, TB.u16.read(reader) / 65535);
  },
  signature: { argTypes: [u32], returnType: vec2f },
  codegenImpl: (_ctx, [e]) => stitch`unpack2x16unorm(${e})`,
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#pack4x8unorm-builtin
 */
export const pack4x8unorm = dualImpl({
  name: 'pack4x8unorm',
  normalImpl: (e: v4f): number =>
    writePacked((writer) => {
      TB.u8.write(writer, Math.floor(0.5 + 255 * clampScalar(e.x, 0, 1)));
      TB.u8.write(writer, Math.floor(0.5 + 255 * clampScalar(e.y, 0, 1)));
      TB.u8.write(writer, Math.floor(0.5 + 255 * clampScalar(e.z, 0, 1)));
      TB.u8.write(writer, Math.floor(0.5 + 255 * clampScalar(e.w, 0, 1)));
    }),
  signature: { argTypes: [vec4f], returnType: u32 },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('pack4x8unorm', [], [e]),
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#pack4x8snorm-builtin
 */
export const pack4x8snorm = dualImpl({
  name: 'pack4x8snorm',
  normalImpl: (e: v4f): number =>
    writePacked((writer) => {
      TB.i8.write(writer, Math.floor(0.5 + 127 * clampScalar(e.x, -1, 1)));
      TB.i8.write(writer, Math.floor(0.5 + 127 * clampScalar(e.y, -1, 1)));
      TB.i8.write(writer, Math.floor(0.5 + 127 * clampScalar(e.z, -1, 1)));
      TB.i8.write(writer, Math.floor(0.5 + 127 * clampScalar(e.w, -1, 1)));
    }),
  signature: { argTypes: [vec4f], returnType: u32 },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('pack4x8snorm', [], [e]),
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#pack4xi8-builtin
 */
export const pack4xI8 = dualImpl({
  name: 'pack4xI8',
  normalImpl: (e: v4i): number =>
    writePacked((writer) => {
      TB.i8.write(writer, e.x);
      TB.i8.write(writer, e.y);
      TB.i8.write(writer, e.z);
      TB.i8.write(writer, e.w);
    }),
  signature: { argTypes: [vec4i], returnType: u32 },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('pack4xI8', [], [e]),
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#pack4xu8-builtin
 */
export const pack4xU8 = dualImpl({
  name: 'pack4xU8',
  normalImpl: (e: v4u): number =>
    writePacked((writer) => {
      TB.u8.write(writer, e.x);
      TB.u8.write(writer, e.y);
      TB.u8.write(writer, e.z);
      TB.u8.write(writer, e.w);
    }),
  signature: { argTypes: [vec4u], returnType: u32 },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('pack4xU8', [], [e]),
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#pack4xi8clamp-builtin
 */
export const pack4xI8Clamp = dualImpl({
  name: 'pack4xI8Clamp',
  normalImpl: (e: v4i): number =>
    writePacked((writer) => {
      TB.i8.write(writer, clampScalar(e.x, -128, 127));
      TB.i8.write(writer, clampScalar(e.y, -128, 127));
      TB.i8.write(writer, clampScalar(e.z, -128, 127));
      TB.i8.write(writer, clampScalar(e.w, -128, 127));
    }),
  signature: { argTypes: [vec4i], returnType: u32 },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('pack4xI8Clamp', [], [e]),
  sideEffects: false,
});

/**
 * @privateRemarks
 * https://www.w3.org/TR/WGSL/#pack4xu8clamp-builtin
 */
export const pack4xU8Clamp = dualImpl({
  name: 'pack4xU8Clamp',
  normalImpl: (e: v4u): number =>
    writePacked((writer) => {
      TB.u8.write(writer, clampScalar(e.x, 0, 255));
      TB.u8.write(writer, clampScalar(e.y, 0, 255));
      TB.u8.write(writer, clampScalar(e.z, 0, 255));
      TB.u8.write(writer, clampScalar(e.w, 0, 255));
    }),
  signature: { argTypes: [vec4u], returnType: u32 },
  codegenImpl: (ctx, [e]) => ctx.gen.emitCall('pack4xU8Clamp', [], [e]),
  sideEffects: false,
});
