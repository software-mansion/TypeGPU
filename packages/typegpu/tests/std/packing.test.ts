import { describe, expect, it } from 'vitest';
import { vec2f, vec4f, vec4i, vec4u } from 'typegpu/data';
import {
  pack2x16float,
  pack2x16snorm,
  pack2x16unorm,
  pack4x8snorm,
  pack4x8unorm,
  pack4xI8,
  pack4xI8Clamp,
  pack4xU8,
  pack4xU8Clamp,
  unpack2x16float,
  unpack2x16snorm,
  unpack2x16unorm,
  unpack4x8snorm,
  unpack4x8unorm,
  unpack4xI8,
  unpack4xU8,
} from 'typegpu/std';

describe('packing', () => {
  it('packs and unpacks 4x8 unorm', () => {
    const packed = pack4x8unorm(vec4f(0.5, 0.25, 0.75, 1));
    const unpacked = unpack4x8unorm(packed);
    expect(unpacked.x).toBeCloseTo(0.5);
    expect(unpacked.y).toBeCloseTo(0.25);
    expect(unpacked.z).toBeCloseTo(0.75);
    expect(unpacked.w).toBeCloseTo(1);
  });

  it('packs and unpacks 2x16 float', () => {
    const packed = pack2x16float(vec2f(0.5, 0.25));
    const unpacked = unpack2x16float(packed);
    expect(unpacked.x).toBeCloseTo(0.5);
    expect(unpacked.y).toBeCloseTo(0.25);
  });

  it('packs and unpacks normalized values according to WGSL rounding and clamping rules', () => {
    expect(pack4x8unorm(vec4f(-1, 0.25, 0.75, 2))).toBe(0xffbf4000);
    expect(pack4x8snorm(vec4f(-1, -0.5, 0.5, 1))).toBe(0x7f40c181);
    expect(pack2x16unorm(vec2f(-1, 2))).toBe(0xffff0000);
    expect(pack2x16snorm(vec2f(-1, 1))).toBe(0x7fff8001);

    expect(unpack4x8unorm(0xffbf4080)).toEqual(vec4f(128 / 255, 64 / 255, 191 / 255, 1));
    expect(unpack4x8snorm(0x7f40c181)).toEqual(vec4f(-1, -63 / 127, 64 / 127, 1));
    expect(unpack2x16unorm(0xffff8000)).toEqual(vec2f(32768 / 65535, 1));
    expect(unpack2x16snorm(0x7fff8000)).toEqual(vec2f(-1, 1));
  });

  it('packs and unpacks four 8-bit integers', () => {
    expect(pack4xI8(vec4i(-1, -128, 127, 256))).toBe(0x007f80ff);
    expect(pack4xU8(vec4u(1, 2, 255, 256))).toBe(0x00ff0201);
    expect(pack4xI8Clamp(vec4i(-200, -128, 127, 200))).toBe(0x7f7f8080);
    expect(pack4xU8Clamp(vec4u(1, 2, 255, 256))).toBe(0xffff0201);

    expect(unpack4xI8(0x007f80ff)).toEqual(vec4i(-1, -128, 127, 0));
    expect(unpack4xU8(0xff7f8001)).toEqual(vec4u(1, 128, 127, 255));
  });
  it('decodes every byte in every lane with sign extension and snorm saturation', () => {
    const bytes = new DataView(new ArrayBuffer(4));
    for (let byte = 0; byte < 256; byte++) {
      const lanes = [byte, (byte + 1) % 256, (byte + 127) % 256, 255 - byte] as const;
      lanes.forEach((value, lane) => bytes.setUint8(lane, value));
      const word = bytes.getUint32(0, true);
      const sign = (value: number) => (value < 128 ? value : value - 256);
      const signed = [sign(lanes[0]), sign(lanes[1]), sign(lanes[2]), sign(lanes[3])] as const;
      expect(unpack4xU8(word)).toEqual(vec4u(...lanes));
      expect(unpack4xI8(word)).toEqual(vec4i(...signed));
      const snorm = (value: number) => Math.max(-1, value / 127);
      expect(unpack4x8snorm(word)).toEqual(
        vec4f(snorm(signed[0]), snorm(signed[1]), snorm(signed[2]), snorm(signed[3])),
      );
      expect(unpack4x8unorm(word)).toEqual(
        vec4f(lanes[0] / 255, lanes[1] / 255, lanes[2] / 255, lanes[3] / 255),
      );
      expect(pack4xU8(vec4u(...lanes))).toBe(word);
      expect(pack4xI8(vec4i(...signed))).toBe(word);
    }
  });

  it('rounds normalized half ties toward positive infinity', () => {
    expect(pack4x8unorm(vec4f(0.5))).toBe(0x80808080);
    expect(pack4x8snorm(vec4f(-0.5))).toBe(0xc1c1c1c1);
    expect(pack4x8snorm(vec4f(0.5))).toBe(0x40404040);
  });
});
