import { describe, expect } from 'vitest';
import { d, readFromArrayBuffer, writeToArrayBuffer } from 'typegpu';
import { it } from 'typegpu-testing-utility';

/**
 * Shared by the compiled-writer and the no-eval (fallback writer) suites, so both code paths
 * are held to the same byte-level expectations.
 */
export function normalizedFormatCases() {
  describe('unorm10_10_10_2', () => {
    it('reads every 10-bit red value back, including the ones with the top bit set', () => {
      const buffer = new ArrayBuffer(4);
      const view = new DataView(buffer);

      for (let r = 0; r < 1024; r++) {
        view.setUint32(0, (r << 22) >>> 0, true);
        const { x } = readFromArrayBuffer(buffer, d.unorm10_10_10_2);
        expect(x, `r = ${r}`).toBe(Math.fround(r / 1023));
      }
    });

    it('reads green, blue and alpha', () => {
      const buffer = new ArrayBuffer(4);
      new DataView(buffer).setUint32(0, ((1023 << 12) | (512 << 2) | 3) >>> 0, true);

      const { x, y, z, w } = readFromArrayBuffer(buffer, d.unorm10_10_10_2);

      expect([x, y, z, w]).toStrictEqual([0, 1, Math.fround(512 / 1023), 1]);
    });

    it('rounds instead of truncating when writing', () => {
      const buffer = new ArrayBuffer(4);

      writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(0.9, 0.5, 0.25, 0.9));

      const packed = new DataView(buffer).getUint32(0, true);
      expect([
        packed >>> 22,
        (packed >>> 12) & 1023,
        (packed >>> 2) & 1023,
        packed & 3,
      ]).toStrictEqual([
        Math.round(0.9 * 1023),
        Math.round(0.5 * 1023),
        Math.round(0.25 * 1023),
        3,
      ]);
    });

    it('round-trips every 10-bit red value', () => {
      const buffer = new ArrayBuffer(4);

      for (let r = 0; r < 1024; r++) {
        writeToArrayBuffer(buffer, d.unorm10_10_10_2, d.vec4f(r / 1023, 0, 0, 0));
        expect(readFromArrayBuffer(buffer, d.unorm10_10_10_2).x, `r = ${r}`).toBe(
          Math.fround(r / 1023),
        );
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
