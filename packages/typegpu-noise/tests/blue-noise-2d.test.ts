import { describe, expect, it } from 'vitest';
import { blueNoise2d } from '../src/index.ts';
import { generate as baseline } from '../benchmarks/blue-noise/baseline.ts';

const BLUE_NOISE_SIZE = 64;
const thresholds = blueNoise2d.generate({ size: BLUE_NOISE_SIZE });

describe('blueNoise2d.generate', () => {
  it.each([4, 5, 8, 17, 32, 63, 64])(
    'matches the original generator exactly at size %s',
    (size) => {
      for (const seed of [0, 42, 0xffffffff]) {
        expect(blueNoise2d.generate({ size, seed })).toEqual(baseline({ size, seed }));
      }
    },
  );

  it.each([4, 5, 8, 17, 32, 64])('has uniform rank midpoints for size %s', (size) => {
    const values = blueNoise2d.generate({ size });
    const count = size * size;
    expect(values).toBeInstanceOf(Float32Array);
    expect(values).toHaveLength(count);
    expect(values.toSorted()).toEqual(
      Float32Array.from({ length: count }, (_, rank) => (rank + 0.5) / count),
    );
    expect(values.reduce((sum, value) => sum + value, 0) / count).toBeCloseTo(0.5, 7);
  });

  it('is deterministic and has independent state for each seed and call', () => {
    const first = blueNoise2d.generate({ size: 16, seed: 0 });
    const second = blueNoise2d.generate({ size: 16, seed: 42 });
    expect(first).not.toEqual(second);
    expect(blueNoise2d.generate({ size: 16, seed: 0 })).toEqual(first);
    expect(blueNoise2d.generate({ size: 16, seed: 42 })).toEqual(second);
    expect(blueNoise2d.generate()).toEqual(thresholds);
    expect(blueNoise2d.generate({ size: 16, seed: 0xffffffff })).toHaveLength(256);
  });

  it('can be precomputed and restored as JSON without changing thresholds', () => {
    const json = JSON.stringify(Array.from(thresholds));
    expect(new Float32Array(JSON.parse(json))).toEqual(thresholds);
  });

  it.each([0, -1, 1, 3, 4.5, NaN, Infinity, 4096])('rejects invalid size %s', (size) => {
    expect(() => blueNoise2d.generate({ size })).toThrow(RangeError);
  });

  it.each([-1, 0.5, NaN, Infinity, 0x100000000])('rejects invalid seed %s', (seed) => {
    expect(() => blueNoise2d.generate({ seed })).toThrow(RangeError);
  });

  it.each([0.1, 0.25, 0.5, 0.75, 0.9, 'continuous'] as const)(
    'suppresses low spatial frequencies at %s coverage',
    (coverage) => {
      const size = BLUE_NOISE_SIZE;
      const values = thresholds.map((value) => {
        return coverage === 'continuous' ? value : Number(value < coverage);
      });
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const whiteNoisePower = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
      let power = 0;
      let modes = 0;
      // DFT on the periodic tile. Check a disk of low frequencies, excluding DC.
      // Independent white noise has expected power N * variance in each mode.
      for (let ky = -6; ky <= 6; ky++) {
        for (let kx = -6; kx <= 6; kx++) {
          const radiusSquared = kx * kx + ky * ky;
          if (radiusSquared === 0 || radiusSquared > 36) continue;
          let real = 0;
          let imaginary = 0;
          for (let i = 0; i < values.length; i++) {
            const angle = (2 * Math.PI * (kx * (i % size) + ky * Math.floor(i / size))) / size;
            real += (values[i] - mean) * Math.cos(angle);
            imaginary += (values[i] - mean) * Math.sin(angle);
          }
          power += real ** 2 + imaginary ** 2;
          modes++;
        }
      }
      expect(power / modes / whiteNoisePower).toBeLessThan(0.1);
    },
  );
});
