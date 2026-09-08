// Frozen pre-optimization CPU reference for benchmarks and exact-output regression tests.
export interface BlueNoise2DOptions {
  /** Side length of the square tile, in pixels. Defaults to 64. */
  size?: number;
  /** Unsigned 32-bit seed. Defaults to 0. Does not affect randf's state. */
  seed?: number;
}

/**
 * Generates a seamless, periodic blue-noise dither tile on the CPU.
 *
 * Returns `size * size` thresholds in row-major order (`y * size + x`).
 * Each threshold is a normalized rank midpoint, `(rank + 0.5) / (size * size)`,
 * in (0, 1). Subtract 0.5 for centered dither. Sample at integer pixel
 * coordinates with wrapping and without interpolation.
 *
 * Uses Ulichney's void-and-cluster algorithm with Gaussian sigma = 1.5 pixels:
 * https://cv.ulichney.com/papers/1993-void-cluster.pdf
 *
 * This is a synchronous setup/build-time operation, not a shader function.
 * Ranking takes O(size^4) time and O(size^2) memory. Prefer small tiles
 * (e.g. 32 or 64); generate once, precompute, or run in a worker.
 * Identical options produce identical output within the same implementation;
 * the exact pattern may change between releases.
 *
 * @example
 * ```ts
 * const values = blueNoise2d.generate({ size: 64, seed: 42 });
 * const buffer = root.createReadonly(d.arrayOf(d.f32, values.length), values);
 * // Alternatively, save Array.from(values) as JSON at build time.
 * ```
 */
export function generate(options: BlueNoise2DOptions = {}): Float32Array {
  const { size = 64, seed = 0 } = options;
  // Midpoints must remain strictly below 1 when stored as f32.
  if (!Number.isSafeInteger(size) || size < 4 || size * size > 2 ** 23) {
    throw new RangeError('Blue-noise size must be an integer >= 4 with size squared <= 2^23.');
  }
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('Blue-noise seed must be an unsigned 32-bit integer.');
  }

  const count = size * size;
  const initialCount = Math.floor(count * 0.1);
  const pattern = new Uint8Array(count);
  const energy = new Float64Array(count);
  const kernel = Float64Array.from({ length: count }, (_, i) => {
    const x = Math.min(i % size, size - (i % size));
    const y = Math.min(Math.floor(i / size), size - Math.floor(i / size));
    return Math.exp(-(x * x + y * y) / (2 * 1.5 ** 2));
  });

  function setPixel(index: number, value: number) {
    const delta = value - (pattern[index] as number);
    pattern[index] = value;
    const x = index % size;
    const y = Math.floor(index / size);
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        energy[row * size + col] =
          (energy[row * size + col] as number) +
          delta * (kernel[((row - y + size) % size) * size + ((col - x + size) % size)] as number);
      }
    }
  }

  function findPixel(value: number, tightest: boolean) {
    let best = -1;
    let bestEnergy = tightest ? -Infinity : Infinity;
    for (let i = 0; i < count; i++) {
      if (pattern[i] !== value) continue;
      if (tightest ? (energy[i] as number) > bestEnergy : (energy[i] as number) < bestEnergy) {
        best = i;
        bestEnergy = energy[i] as number;
      }
    }
    return best;
  }

  // Local PRNG state: generating a tile does not alter randf's random sequence.
  let state = seed;
  const shuffled = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    // Mulberry32 supports every u32 seed, including zero.
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const random = ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    const j = Math.floor(random * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j] as number, shuffled[i] as number];
  }
  for (const index of shuffled.slice(0, initialCount)) setPixel(index, 1);

  // Relax the seed pattern until removing a cluster exposes the largest void.
  for (;;) {
    const cluster = findPixel(1, true);
    setPixel(cluster, 0);
    const voidPixel = findPixel(0, false);
    // Stop on ties too, so floating-point drift cannot cycle between equal patterns.
    if ((energy[voidPixel] as number) >= (energy[cluster] as number) - 1e-12) {
      setPixel(cluster, 1);
      break;
    }
    setPixel(voidPixel, 1);
  }

  const prototype = pattern.slice();
  const prototypeEnergy = energy.slice();
  const thresholds = new Float32Array(count);

  // Rank the sparse half by removing clusters, then filling voids.
  for (let rank = initialCount - 1; rank >= 0; rank--) {
    const cluster = findPixel(1, true);
    thresholds[cluster] = (rank + 0.5) / count;
    setPixel(cluster, 0);
  }
  pattern.set(prototype);
  energy.set(prototypeEnergy);
  for (let rank = initialCount; rank < Math.floor(count / 2); rank++) {
    const voidPixel = findPixel(0, false);
    thresholds[voidPixel] = (rank + 0.5) / count;
    setPixel(voidPixel, 1);
  }

  // Above half coverage, zeros are the minority: remove their tightest clusters.
  // Minimum energy of ones means maximum energy of zeros on the periodic grid.
  for (let rank = Math.floor(count / 2); rank < count; rank++) {
    const cluster = findPixel(0, false);
    thresholds[cluster] = (rank + 0.5) / count;
    setPixel(cluster, 1);
  }

  return thresholds;
}
