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

  // Repeat the periodic kernel 2×2 so each update reads contiguous rows without
  // modulo in the inner loop. Keep f64 contributions and row-major tie-breaking.
  const expandedKernel = Float64Array.from(
    { length: count * 4 },
    (_, i) => kernel[(Math.floor(i / (size * 2)) % size) * size + (i % size)] as number,
  );
  let bestFull = -1;
  let bestEmpty = -1;

  // Update energy and find the next cluster/void in one traversal.
  function setPixel(index: number, value: number) {
    const delta = value - (pattern[index] as number);
    pattern[index] = value;
    const x = index % size;
    const y = Math.floor(index / size);
    let minEnergy = Infinity;
    let maxEnergy = -Infinity;
    let full = -1;
    let empty = -1;
    for (let row = 0; row < size; row++) {
      const kernelRow = (row - y + size) * size * 2 + size - x;
      const targetRow = row * size;
      for (let col = 0; col < size; col++) {
        const target = targetRow + col;
        const source = kernelRow + col;
        const e = (energy[target] as number) + delta * (expandedKernel[source] as number);
        energy[target] = e;
        if (pattern[target] === 1) {
          if (e > maxEnergy) {
            maxEnergy = e;
            full = target;
          }
        } else if (e < minEnergy) {
          minEnergy = e;
          empty = target;
        }
      }
    }
    bestFull = full;
    bestEmpty = empty;
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
    const cluster = bestFull;
    setPixel(cluster, 0);
    const voidPixel = bestEmpty;
    // Stop on ties too, so floating-point drift cannot cycle between equal patterns.
    if ((energy[voidPixel] as number) >= (energy[cluster] as number) - 1e-12) {
      setPixel(cluster, 1);
      break;
    }
    setPixel(voidPixel, 1);
  }

  const prototype = pattern.slice();
  const prototypeEnergy = energy.slice();
  const prototypeBestFull = bestFull;
  const prototypeBestEmpty = bestEmpty;
  const thresholds = new Float32Array(count);

  // Rank the sparse half by removing clusters, then filling voids.
  for (let rank = initialCount - 1; rank >= 0; rank--) {
    const cluster = bestFull;
    thresholds[cluster] = (rank + 0.5) / count;
    setPixel(cluster, 0);
  }
  pattern.set(prototype);
  energy.set(prototypeEnergy);
  bestFull = prototypeBestFull;
  bestEmpty = prototypeBestEmpty;
  for (let rank = initialCount; rank < Math.floor(count / 2); rank++) {
    const voidPixel = bestEmpty;
    thresholds[voidPixel] = (rank + 0.5) / count;
    setPixel(voidPixel, 1);
  }

  // Above half coverage, zeros are the minority: remove their tightest clusters.
  // Minimum energy of ones means maximum energy of zeros on the periodic grid.
  for (let rank = Math.floor(count / 2); rank < count; rank++) {
    const cluster = bestEmpty;
    thresholds[cluster] = (rank + 0.5) / count;
    setPixel(cluster, 1);
  }

  return thresholds;
}
