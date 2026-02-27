/**
 * Returns the next power of 2 greater than or equal to n.
 * If n is already a power of 2, returns n.
 */
export function nextPowerOf2(n: number): number {
  if (n <= 0) return 1;
  if ((n & (n - 1)) === 0) return n;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}
