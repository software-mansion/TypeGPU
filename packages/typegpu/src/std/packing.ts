import * as TB from 'typed-binary';
import { dualImpl } from '../core/function/dualImpl.ts';
import { stitch } from '../core/resolve/stitch.ts';
import { u32 } from '../data/numeric.ts';
import { vec2f, vec4f } from '../data/vector.ts';
import type { v2f, v4f } from '../data/wgslTypes.ts';

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#unpack2x16float-builtin
 */
export const unpack2x16float = dualImpl({
  name: 'unpack2x16float',
  normalImpl: (e: number): v2f => {
    const buffer = new ArrayBuffer(4);
    const writer = new TB.BufferWriter(buffer);
    writer.writeUint32(e);
    const reader = new TB.BufferReader(buffer);
    return vec2f(reader.readFloat16(), reader.readFloat16());
  },
  signature: { argTypes: [u32], returnType: vec2f },
  codegenImpl: (_ctx, [e]) => stitch`unpack2x16float(${e})`,
});

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#pack2x16float-builtin
 */
export const pack2x16float = dualImpl({
  name: 'pack2x16float',
  normalImpl: (e: v2f): number => {
    const buffer = new ArrayBuffer(4);
    const writer = new TB.BufferWriter(buffer);
    writer.writeFloat16(e.x);
    writer.writeFloat16(e.y);
    const reader = new TB.BufferReader(buffer);
    return u32(reader.readUint32());
  },
  signature: { argTypes: [vec2f], returnType: u32 },
  codegenImpl: (_ctx, [e]) => stitch`pack2x16float(${e})`,
});

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#unpack4x8unorm-builtin
 */
export const unpack4x8unorm = dualImpl({
  name: 'unpack4x8unorm',
  normalImpl: (e: number): v4f => {
    const buffer = new ArrayBuffer(4);
    const writer = new TB.BufferWriter(buffer);
    writer.writeUint32(e);
    const reader = new TB.BufferReader(buffer);
    return vec4f(
      reader.readUint8() / 255,
      reader.readUint8() / 255,
      reader.readUint8() / 255,
      reader.readUint8() / 255,
    );
  },
  signature: { argTypes: [u32], returnType: vec4f },
  codegenImpl: (_ctx, [e]) => stitch`unpack4x8unorm(${e})`,
});

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#pack4x8unorm-builtin
 */
export const pack4x8unorm = dualImpl({
  name: 'pack4x8unorm',
  normalImpl: (e: v4f): number => {
    const buffer = new ArrayBuffer(4);
    const writer = new TB.BufferWriter(buffer);
    writer.writeUint8(e.x * 255);
    writer.writeUint8(e.y * 255);
    writer.writeUint8(e.z * 255);
    writer.writeUint8(e.w * 255);
    const reader = new TB.BufferReader(buffer);
    return u32(reader.readUint32());
  },
  signature: { argTypes: [vec4f], returnType: u32 },
  codegenImpl: (_ctx, [e]) => stitch`pack4x8unorm(${e})`,
});
