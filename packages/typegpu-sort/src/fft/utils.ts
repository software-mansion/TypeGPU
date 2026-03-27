/**
 * Next power of two ≥ n. For n ≤ 0 returns 1.
 */
export function nextPowerOf2(n: number): number {
  if (n <= 0) return 1;
  if ((n & (n - 1)) === 0) return n;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

export function log2Int(n: number): number {
  if (n <= 0 || (n & (n - 1)) !== 0) {
    throw new Error(`log2Int expects a positive power of two, got ${n}`);
  }
  return 31 - Math.clz32(n);
}

const MAX_WORKGROUPS_PER_DIMENSION = 65535;

/**
 * Decomposes a total workgroup count into a 3D dispatch grid (x, y, z),
 * respecting the WebGPU limit of 65535 workgroups per dimension.
 */
export function decomposeWorkgroups(total: number): [number, number, number] {
  if (total <= 0) {
    return [1, 1, 1];
  }

  const x = Math.min(total, MAX_WORKGROUPS_PER_DIMENSION);
  const remainingAfterX = Math.ceil(total / x);

  const y = Math.min(remainingAfterX, MAX_WORKGROUPS_PER_DIMENSION);
  const remainingAfterY = Math.ceil(remainingAfterX / y);

  const z = Math.min(remainingAfterY, MAX_WORKGROUPS_PER_DIMENSION);

  if (Math.ceil(total / (x * y * z)) > 1) {
    throw new Error(
      `Required workgroups (${total}) exceed device dispatch limits (${MAX_WORKGROUPS_PER_DIMENSION} per dimension)`,
    );
  }

  return [x, y, z];
}
