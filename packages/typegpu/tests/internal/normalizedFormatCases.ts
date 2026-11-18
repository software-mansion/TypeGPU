import { describe, expect } from 'vitest';
import { d, readFromArrayBuffer, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

/**
 * Packs `[r, g, b, a]` the way the WebGPU CTS does for `unorm10-10-10-2`
 * (`makeRgb10a2` in `api/operation/vertex_state/correctness.spec.ts`):
 * the first component in the lowest bits.
 */
type Rgb10a2 = readonly [r: number, g: number, b: number, a: number];

function makeRgb10a2([r, g, b, a]: Rgb10a2): number {
  return (r | (g << 10) | (b << 20) | (a << 30)) >>> 0;
}

function normalizeRgb10a2([r, g, b, a]: Rgb10a2): Rgb10a2 {
  return [Math.fround(r / 1023), Math.fround(g / 1023), Math.fround(b / 1023), Math.fround(a / 3)];
}

const unorm1010102Fixtures = [
  [0, 0, 0, 0],
  [1023, 1023, 1023, 3],
  [243, 567, 765, 2],
  [1023, 0, 0, 0],
  [0, 0, 0, 1],
] satisfies Rgb10a2[];

/**
 * Packs `[r, g, b, a]` the way the WebGPU CTS does for `snorm10-10-10-2`
 * (`makeRgb10a2Signed` in `api/operation/vertex_state/correctness.spec.ts`).
 */
function makeRgb10a2Signed([r, g, b, a]: Rgb10a2): number {
  return ((r & 0x3ff) | ((g & 0x3ff) << 10) | ((b & 0x3ff) << 20) | ((a & 0x3) << 30)) >>> 0;
}

function normalizeRgb10a2Signed([r, g, b, a]: Rgb10a2): Rgb10a2 {
  return [
    Math.fround(Math.max(r / 511, -1)),
    Math.fround(Math.max(g / 511, -1)),
    Math.fround(Math.max(b / 511, -1)),
    Math.max(a, -1),
  ];
}

const snorm1010102Fixtures = [
  [0, 0, 0, 0],
  [511, 511, 511, 1],
  [-512, -512, -512, -2],
  [243, -123, 342, -1],
  [511, 0, 0, 0],
  [-1, 0, 0, 0],
] satisfies Rgb10a2[];

/**
 * Shared by the compiled-writer and the no-eval (fallback writer) suites, so both code paths
 * are held to the same byte-level expectations.
 */
export function normalizedFormatCases() {
  describe('unorm10_10_10_2', () => {
    it('reads the CTS fixtures', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);

      for (const rgba of unorm1010102Fixtures) {
        view.setUint32(0, makeRgb10a2(rgba), true);
        const { x, y, z, w } = readFromArrayBuffer(buffer, d.unorm10_10_10_2);
        expect([x, y, z, w], `[${rgba}]`).toStrictEqual(normalizeRgb10a2(rgba));
      }
    });

    it('reads every 10-bit value of every channel', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);

      for (let v = 0; v < 1024; v++) {
        view.setUint32(0, makeRgb10a2([v, 0, 0, 0]), true);
        expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2).x, `r = ${v}`).toBe(
          Math.fround(v / 1023),
        );
        view.setUint32(0, makeRgb10a2([0, v, 0, 0]), true);
        expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2).y, `g = ${v}`).toBe(
          Math.fround(v / 1023),
        );
        view.setUint32(0, makeRgb10a2([0, 0, v, 0]), true);
        expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2).z, `b = ${v}`).toBe(
          Math.fround(v / 1023),
        );
      }
    });

    it('writes the CTS fixtures', () => {
      const buffer = new ArrayBuffer(4);

      for (const rgba of unorm1010102Fixtures) {
        writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(...normalizeRgb10a2(rgba)));
        expect(new DataView(buffer).getUint32(0, true), `[${rgba}]`).toBe(makeRgb10a2(rgba));
      }
    });

    it('writes the first component into the lowest bits', () => {
      const buffer = new ArrayBuffer(4);

      writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(1, 0, 0, 0));

      expect(new DataView(buffer).getUint32(0, true)).toBe(0x000003ff);
    });

    it('rounds instead of truncating when writing', () => {
      const buffer = new ArrayBuffer(4);

      writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(0.9, 0.5, 0.25, 0.9));

      expect(new DataView(buffer).getUint32(0, true)).toBe(
        makeRgb10a2([Math.round(0.9 * 1023), Math.round(0.5 * 1023), Math.round(0.25 * 1023), 3]),
      );
    });

    it('clamps out-of-range components before packing', () => {
      const buffer = new ArrayBuffer(4);

      writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(1.01, -0.01, 2, 1.5));
      expect(new DataView(buffer).getUint32(0, true)).toBe(makeRgb10a2([1023, 0, 1023, 3]));

      writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(-1, 0.5, -0.5, -1));
      expect(new DataView(buffer).getUint32(0, true)).toBe(makeRgb10a2([0, 512, 0, 0]));
    });

    it('round-trips every 10-bit value of every channel', () => {
      const buffer = new ArrayBuffer(4);

      for (let v = 0; v < 1024; v++) {
        writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(v / 1023, 0, 0, 0));
        expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2).x, `r = ${v}`).toBe(
          Math.fround(v / 1023),
        );
        writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(0, v / 1023, 0, 0));
        expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2).y, `g = ${v}`).toBe(
          Math.fround(v / 1023),
        );
        writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(0, 0, v / 1023, 0));
        expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2).z, `b = ${v}`).toBe(
          Math.fround(v / 1023),
        );
      }
      for (let v = 0; v < 4; v++) {
        writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(0, 0, 0, v / 3));
        expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2).w, `a = ${v}`).toBe(
          Math.fround(v / 3),
        );
      }
    });
  });

  describe('snorm10_10_10_2', () => {
    it('reads the CTS fixtures', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);

      for (const rgba of snorm1010102Fixtures) {
        view.setUint32(0, makeRgb10a2Signed(rgba), true);
        const { x, y, z, w } = readFromArrayBuffer(buffer, d.snorm10_10_10_2);
        expect([x, y, z, w], `[${rgba}]`).toStrictEqual(normalizeRgb10a2Signed(rgba));
      }
    });

    it('writes the CTS fixtures', () => {
      const buffer = new ArrayBuffer(4);

      // -512 and -511 both normalize to -1, which is written back as -511
      for (const rgba of snorm1010102Fixtures.filter((rgba) => !rgba.includes(-512))) {
        writeToArrayBuffer(buffer, d.snorm10_10_10_2, d.vec4f(...normalizeRgb10a2Signed(rgba)));
        expect(new DataView(buffer).getUint32(0, true), `[${rgba}]`).toBe(makeRgb10a2Signed(rgba));
      }

      writeToArrayBuffer(buffer, d.snorm10_10_10_2, d.vec4f(-1, -1, -1, -1));
      expect(new DataView(buffer).getUint32(0, true)).toBe(
        makeRgb10a2Signed([-511, -511, -511, -1]),
      );
    });

    it('clamps out-of-range components before packing', () => {
      const buffer = new ArrayBuffer(4);

      writeToArrayBuffer(buffer, d.snorm10_10_10_2, d.vec4f(1.01, -1.01, 2, 1.5));
      expect(new DataView(buffer).getUint32(0, true)).toBe(makeRgb10a2Signed([511, -511, 511, 1]));

      writeToArrayBuffer(buffer, d.snorm10_10_10_2, d.vec4f(-2, 0.5, -0.5, -3));
      expect(new DataView(buffer).getUint32(0, true)).toBe(
        makeRgb10a2Signed([-511, 256, -255, -1]),
      );
    });

    it('round-trips every 10-bit value of every channel', () => {
      const buffer = new ArrayBuffer(4);

      for (let v = -511; v <= 511; v++) {
        writeToArrayBuffer(buffer, d.snorm10_10_10_2, d.vec4f(v / 511, 0, 0, 0));
        expect(readFromArrayBuffer(buffer, d.snorm10_10_10_2).x, `r = ${v}`).toBe(
          Math.fround(v / 511),
        );
        writeToArrayBuffer(buffer, d.snorm10_10_10_2, d.vec4f(0, v / 511, 0, 0));
        expect(readFromArrayBuffer(buffer, d.snorm10_10_10_2).y, `g = ${v}`).toBe(
          Math.fround(v / 511),
        );
        writeToArrayBuffer(buffer, d.snorm10_10_10_2, d.vec4f(0, 0, v / 511, 0));
        expect(readFromArrayBuffer(buffer, d.snorm10_10_10_2).z, `b = ${v}`).toBe(
          Math.fround(v / 511),
        );
      }
      for (const a of [-1, 0, 1]) {
        writeToArrayBuffer(buffer, d.snorm10_10_10_2, d.vec4f(0, 0, 0, a));
        expect(readFromArrayBuffer(buffer, d.snorm10_10_10_2).w, `a = ${a}`).toBe(a);
      }
    });
  });

  describe('unorm16', () => {
    it('rounds scalar, vec2 and vec4 values to the nearest integer', () => {
      // 0.5 * 65535 = 32767.5 sits exactly between two integers
      const scalar = new ArrayBuffer(2);
      writeToArrayBuffer(scalar, d.unorm16, 0.5);
      expect([...new Uint16Array(scalar)]).toStrictEqual([32768]);

      const pair = new ArrayBuffer(4);
      writeToArrayBuffer(pair, d.unorm16x2, d.vec2f(0.5, 0.25));
      expect([...new Uint16Array(pair)]).toStrictEqual([32768, Math.round(0.25 * 65535)]);

      const quad = new ArrayBuffer(8);
      writeToArrayBuffer(quad, d.unorm16x4, d.vec4f(0.5, 0.25, 0.75, 1));
      expect([...new Uint16Array(quad)]).toStrictEqual([
        32768,
        Math.round(0.25 * 65535),
        Math.round(0.75 * 65535),
        65535,
      ]);
    });
  });

  describe('unorm8x4_bgra', () => {
    it('writes rounded components in b, g, r, a order', () => {
      const buffer = new ArrayBuffer(4);

      writeToArrayBuffer(buffer, d.unorm8x4_bgra, d.vec4f(0.25, 0.5, 0.75, 1));

      expect([...new Uint8Array(buffer)]).toStrictEqual([191, 128, 64, 255]);
    });
  });
}
