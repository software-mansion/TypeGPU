import * as TB from 'typed-binary';
import { u32 } from '../data/numeric';
import { vec2f, vec4f } from '../data/vector';
import type { v2f, v4f } from '../data/wgslTypes';
import { createDualImpl } from '../shared/generators';

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#unpack2x16float-builtin
 */
export const unpack2x16float = createDualImpl(
  // CPU implementation
  (e: number): v2f => {
    const buffer = new ArrayBuffer(4);
    const writer = new TB.BufferWriter(buffer);
    writer.writeUint32(e);
    const reader = new TB.BufferReader(buffer);
    return vec2f(reader.readFloat16(), reader.readFloat16());
  },
  // GPU implementation
  (e) => {
    return {
      value: `unpack2x16float(${e.value})`,
      dataType: vec2f,
    };
  },
);

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#pack2x16float-builtin
 Converts two floating point values to half-precision floating point numbers, and then combines them into one u32 value.
 Component e[i] of the input is converted to a IEEE-754 binary16 value, which is then placed in bits 16 × i through 16 × i + 15 of the result. See § 15.7.6 Floating Point Conversion.
 */
export const pack2x16float = createDualImpl(
  // CPU implementation
  (e: v2f): number => {
    const buffer = new ArrayBuffer(4);
    const writer = new TB.BufferWriter(buffer);
    writer.writeFloat16(e.x);
    writer.writeFloat16(e.y);
    const reader = new TB.BufferReader(buffer);
    return u32(reader.readUint32());
  },
  // GPU implementation
  (e) => {
    return {
      value: `pack2x16float(${e.value})`,
      dataType: u32,
    };
  },
);

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#unpack4x8unorm-builtin
 */
export const unpack4x8unorm = createDualImpl(
  // CPU implementation
  (e: number): v4f => {
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
  // GPU implementation
  (e) => {
    return {
      value: `unpack4x8unorm(${e.value})`,
      dataType: vec4f,
    };
  },
);

/**
 * @privateRemarks
 * https://gpuweb.github.io/gpuweb/wgsl/#pack4x8unorm-builtin
 */
export const pack4x8unorm = createDualImpl(
  // CPU implementation
  (e: v4f): number => {
    const buffer = new ArrayBuffer(4);
    const writer = new TB.BufferWriter(buffer);
    writer.writeUint8(e.x * 255);
    writer.writeUint8(e.y * 255);
    writer.writeUint8(e.z * 255);
    writer.writeUint8(e.w * 255);
    const reader = new TB.BufferReader(buffer);
    return u32(reader.readUint32());
  },
  // GPU implementation
  (e) => {
    return {
      value: `pack4x8unorm(${e.value})`,
      dataType: u32,
    };
  },
);
