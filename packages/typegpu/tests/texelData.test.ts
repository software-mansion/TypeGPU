import { BufferWriter } from 'typed-binary';
import { describe, expect, it } from 'vitest';
import { writeTexelData } from '../src/data/dataIO.ts';
import { vec4f, vec4i, vec4u } from '../src/data/vector.ts';

function writeToBuffer(
  format: GPUTextureFormat,
  value:
    | ReturnType<typeof vec4f>
    | ReturnType<typeof vec4i>
    | ReturnType<typeof vec4u>,
): Uint8Array {
  const buffer = new ArrayBuffer(16);
  const writer = new BufferWriter(buffer);
  writeTexelData(writer, format, value);
  return new Uint8Array(buffer, 0, writer.currentByteOffset);
}

describe('writeTexelData', () => {
  describe('8-bit formats', () => {
    it('writes r8unorm', () => {
      const result = writeToBuffer('r8unorm', vec4f(0.5, 0, 0, 0));
      expect(result).toEqual(new Uint8Array([128]));
    });

    it('writes r8snorm', () => {
      const result = writeToBuffer('r8snorm', vec4f(0.5, 0, 0, 0));
      expect(result).toEqual(new Uint8Array([64]));
    });

    it('writes r8uint', () => {
      const result = writeToBuffer('r8uint', vec4u(200, 0, 0, 0));
      expect(result).toEqual(new Uint8Array([200]));
    });

    it('writes r8sint', () => {
      const result = writeToBuffer('r8sint', vec4i(-50, 0, 0, 0));
      expect(result).toEqual(new Uint8Array([206])); // -50 as signed byte
    });

    it('writes rg8unorm', () => {
      const result = writeToBuffer('rg8unorm', vec4f(1.0, 0.5, 0, 0));
      expect(result).toEqual(new Uint8Array([255, 128]));
    });

    it('writes rgba8unorm', () => {
      const result = writeToBuffer('rgba8unorm', vec4f(1.0, 0.5, 0.25, 0.0));
      expect(result).toEqual(new Uint8Array([255, 128, 64, 0]));
    });

    it('writes rgba8uint', () => {
      const result = writeToBuffer('rgba8uint', vec4u(10, 20, 30, 40));
      expect(result).toEqual(new Uint8Array([10, 20, 30, 40]));
    });

    it('writes bgra8unorm with swizzled channels', () => {
      const result = writeToBuffer('bgra8unorm', vec4f(1.0, 0.5, 0.25, 0.75));
      // BGRA order: z, y, x, w
      expect(result).toEqual(new Uint8Array([64, 128, 255, 191]));
    });
  });

  describe('16-bit formats', () => {
    it('writes r16unorm', () => {
      const result = writeToBuffer('r16unorm', vec4f(0.5, 0, 0, 0));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getUint16(0, true)).toBe(32768);
    });

    it('writes r16uint', () => {
      const result = writeToBuffer('r16uint', vec4u(1000, 0, 0, 0));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getUint16(0, true)).toBe(1000);
    });

    it('writes rg16float', () => {
      const result = writeToBuffer('rg16float', vec4f(1.0, 2.0, 0, 0));
      expect(result.length).toBe(4);
    });

    it('writes rgba16uint', () => {
      const result = writeToBuffer('rgba16uint', vec4u(100, 200, 300, 400));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getUint16(0, true)).toBe(100);
      expect(view.getUint16(2, true)).toBe(200);
      expect(view.getUint16(4, true)).toBe(300);
      expect(view.getUint16(6, true)).toBe(400);
    });

    it('writes rgba16float', () => {
      const result = writeToBuffer('rgba16float', vec4f(1.0, 2.0, 3.0, 4.0));
      expect(result.length).toBe(8);
    });
  });

  describe('32-bit formats', () => {
    it('writes r32float', () => {
      const result = writeToBuffer('r32float', vec4f(3.14, 0, 0, 0));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getFloat32(0, true)).toBeCloseTo(3.14);
    });

    it('writes r32uint', () => {
      const result = writeToBuffer('r32uint', vec4u(123456, 0, 0, 0));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getUint32(0, true)).toBe(123456);
    });

    it('writes rg32float', () => {
      const result = writeToBuffer('rg32float', vec4f(1.5, 2.5, 0, 0));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getFloat32(0, true)).toBeCloseTo(1.5);
      expect(view.getFloat32(4, true)).toBeCloseTo(2.5);
    });

    it('writes rgba32float', () => {
      const result = writeToBuffer('rgba32float', vec4f(1.0, 2.0, 3.0, 4.0));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getFloat32(0, true)).toBeCloseTo(1.0);
      expect(view.getFloat32(4, true)).toBeCloseTo(2.0);
      expect(view.getFloat32(8, true)).toBeCloseTo(3.0);
      expect(view.getFloat32(12, true)).toBeCloseTo(4.0);
    });

    it('writes rgba32uint', () => {
      const result = writeToBuffer('rgba32uint', vec4u(1, 2, 3, 4));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getUint32(0, true)).toBe(1);
      expect(view.getUint32(4, true)).toBe(2);
      expect(view.getUint32(8, true)).toBe(3);
      expect(view.getUint32(12, true)).toBe(4);
    });

    it('writes rgba32sint', () => {
      const result = writeToBuffer('rgba32sint', vec4i(-1, -2, 3, 4));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getInt32(0, true)).toBe(-1);
      expect(view.getInt32(4, true)).toBe(-2);
      expect(view.getInt32(8, true)).toBe(3);
      expect(view.getInt32(12, true)).toBe(4);
    });
  });

  describe('packed formats', () => {
    it('writes rgb10a2unorm', () => {
      const result = writeToBuffer('rgb10a2unorm', vec4f(1.0, 0.5, 0.0, 1.0));
      expect(result.length).toBe(4);
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      const packed = view.getUint32(0, true);
      // r = 1023 (10 bits), g = 512 (10 bits), b = 0 (10 bits), a = 3 (2 bits)
      expect(packed & 0x3ff).toBe(1023); // r
      expect((packed >> 10) & 0x3ff).toBe(512); // g
      expect((packed >> 20) & 0x3ff).toBe(0); // b
      expect((packed >> 30) & 0x3).toBe(3); // a
    });

    it('writes rgb10a2uint', () => {
      const result = writeToBuffer('rgb10a2uint', vec4u(100, 200, 300, 2));
      expect(result.length).toBe(4);
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      const packed = view.getUint32(0, true);
      expect(packed & 0x3ff).toBe(100);
      expect((packed >> 10) & 0x3ff).toBe(200);
      expect((packed >> 20) & 0x3ff).toBe(300);
      expect((packed >> 30) & 0x3).toBe(2);
    });

    it('writes rg11b10ufloat', () => {
      const result = writeToBuffer('rg11b10ufloat', vec4f(1.0, 1.0, 1.0, 0));
      expect(result.length).toBe(4);
    });

    it('writes rgb9e5ufloat', () => {
      const result = writeToBuffer('rgb9e5ufloat', vec4f(1.0, 1.0, 1.0, 0));
      expect(result.length).toBe(4);
    });
  });

  describe('depth/stencil formats', () => {
    it('writes stencil8', () => {
      const result = writeToBuffer('stencil8', vec4u(128, 0, 0, 0));
      expect(result).toEqual(new Uint8Array([128]));
    });

    it('writes depth16unorm', () => {
      const result = writeToBuffer('depth16unorm', vec4f(0.5, 0, 0, 0));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getUint16(0, true)).toBe(32768);
    });

    it('writes depth32float', () => {
      const result = writeToBuffer('depth32float', vec4f(0.75, 0, 0, 0));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getFloat32(0, true)).toBeCloseTo(0.75);
    });
  });

  describe('unsupported formats', () => {
    it('throws for compressed formats', () => {
      expect(() => writeToBuffer('bc1-rgba-unorm', vec4f(1, 1, 1, 1))).toThrow(
        /does not support CPU write/,
      );
    });

    it('throws for depth24plus', () => {
      expect(() => writeToBuffer('depth24plus', vec4f(1, 0, 0, 0))).toThrow(
        /does not support CPU write/,
      );
    });
  });

  describe('edge cases', () => {
    it('clamps unorm values correctly', () => {
      const result = writeToBuffer('r8unorm', vec4f(0.0, 0, 0, 0));
      expect(result[0]).toBe(0);

      const result2 = writeToBuffer('r8unorm', vec4f(1.0, 0, 0, 0));
      expect(result2[0]).toBe(255);
    });

    it('handles negative snorm values', () => {
      const result = writeToBuffer('r8snorm', vec4f(-1.0, 0, 0, 0));
      expect(new Int8Array(result.buffer)[0]).toBe(-127);
    });

    it('preserves zero values', () => {
      const result = writeToBuffer('rgba32float', vec4f(0, 0, 0, 0));
      const view = new DataView(
        result.buffer,
        result.byteOffset,
        result.byteLength,
      );
      expect(view.getFloat32(0, true)).toBe(0);
      expect(view.getFloat32(4, true)).toBe(0);
      expect(view.getFloat32(8, true)).toBe(0);
      expect(view.getFloat32(12, true)).toBe(0);
    });
  });
});
