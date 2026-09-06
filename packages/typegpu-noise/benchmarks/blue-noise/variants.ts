// Benchmark-only copy of the production algorithm. Keep phases, precision, seed,
// iteration order and tie-breaking unchanged so output parity is meaningful.
// Inspired by Martin Fiedler's fused scans and doubled Gaussian lookup table:
// https://gist.github.com/kajott/d9f9bb93043040bfe2f48f4f499903d8
export type Variant = 'fused' | 'split' | 'split-fused' | 'doubled' | 'doubled-fused';

export function generateVariant(size: number, seed: number, variant: Variant): Float32Array {
  const fused = variant === 'fused' || variant.endsWith('-fused');
  const wrapping = variant.startsWith('split')
    ? 'split'
    : variant.startsWith('doubled')
      ? 'doubled'
      : 'modulo';
  const count = size * size;
  const initialCount = Math.floor(count * 0.1);
  const pattern = new Uint8Array(count);
  const energy = new Float64Array(count);
  const kernel = Float64Array.from({ length: count }, (_, i) => {
    const x = Math.min(i % size, size - (i % size));
    const y = Math.min(Math.floor(i / size), size - Math.floor(i / size));
    return Math.exp(-(x * x + y * y) / (2 * 1.5 ** 2));
  });

  let bestFull = -1;
  let bestEmpty = -1;
  const expandedKernel =
    wrapping === 'doubled'
      ? Float64Array.from(
          { length: count * 4 },
          (_, i) => kernel[(Math.floor(i / (size * 2)) % size) * size + (i % size)] as number,
        )
      : new Float64Array(0);

  // Separate inner loops deliberately avoid a benchmark-option branch per pixel.
  function moduloFused(index: number, value: number) {
    const delta = value - (pattern[index] as number);
    pattern[index] = value;
    const x = index % size;
    const y = Math.floor(index / size);
    let minEnergy = Infinity;
    let maxEnergy = -Infinity;
    let full = -1;
    let empty = -1;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const target = row * size + col;
        const source = ((row - y + size) % size) * size + ((col - x + size) % size);
        const e = (energy[target] as number) + delta * (kernel[source] as number);
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

  function split(index: number, value: number) {
    const delta = value - (pattern[index] as number);
    pattern[index] = value;
    const x = index % size;
    const y = Math.floor(index / size);
    for (let row = 0; row < size; row++) {
      const kernelRow = (row < y ? row - y + size : row - y) * size;
      const targetRow = row * size;
      for (let col = 0; col < x; col++) {
        const target = targetRow + col;
        const source = kernelRow + size - x + col;
        const e = (energy[target] as number) + delta * (kernel[source] as number);
        energy[target] = e;
      }
      for (let col = x; col < size; col++) {
        const target = targetRow + col;
        const source = kernelRow + col - x;
        const e = (energy[target] as number) + delta * (kernel[source] as number);
        energy[target] = e;
      }
    }
  }

  function splitFused(index: number, value: number) {
    const delta = value - (pattern[index] as number);
    pattern[index] = value;
    const x = index % size;
    const y = Math.floor(index / size);
    let minEnergy = Infinity;
    let maxEnergy = -Infinity;
    let full = -1;
    let empty = -1;
    for (let row = 0; row < size; row++) {
      const kernelRow = (row < y ? row - y + size : row - y) * size;
      const targetRow = row * size;
      for (let col = 0; col < x; col++) {
        const target = targetRow + col;
        const source = kernelRow + size - x + col;
        const e = (energy[target] as number) + delta * (kernel[source] as number);
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
      for (let col = x; col < size; col++) {
        const target = targetRow + col;
        const source = kernelRow + col - x;
        const e = (energy[target] as number) + delta * (kernel[source] as number);
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

  function doubled(index: number, value: number) {
    const delta = value - (pattern[index] as number);
    pattern[index] = value;
    const x = index % size;
    const y = Math.floor(index / size);
    for (let row = 0; row < size; row++) {
      const kernelRow = (row - y + size) * size * 2 + size - x;
      const targetRow = row * size;
      for (let col = 0; col < size; col++) {
        const target = targetRow + col;
        const source = kernelRow + col;
        const e = (energy[target] as number) + delta * (expandedKernel[source] as number);
        energy[target] = e;
      }
    }
  }

  function doubledFused(index: number, value: number) {
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

  const setPixel =
    wrapping === 'modulo'
      ? moduloFused
      : wrapping === 'split'
        ? fused
          ? splitFused
          : split
        : fused
          ? doubledFused
          : doubled;

  function scanPixel(value: number, tightest: boolean) {
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

  function findPixel(value: number, tightest: boolean) {
    return fused ? (value === 1 ? bestFull : bestEmpty) : scanPixel(value, tightest);
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
  if (fused) {
    bestFull = scanPixel(1, true);
    bestEmpty = scanPixel(0, false);
  }
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
