export const smoothstepScalar = (
  edge0: number,
  edge1: number,
  x: number,
): number => {
  if (edge0 === edge1) {
    return 0; // WGSL spec says this is an indeterminate value
  }
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3 - 2 * t);
};

export const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(low, value), high);

export const divInteger = (lhs: number, rhs: number) => {
  if (rhs === 0) {
    return lhs;
  }
  return Math.trunc(lhs / rhs);
};

export function bitcastU32toF32Impl(n: number): number {
  const buffer = new ArrayBuffer(4);
  const float32View = new Float32Array(buffer);
  const uint32View = new Uint32Array(buffer);
  uint32View[0] = n;
  return float32View[0] as number;
}

export function bitcastU32toI32Impl(n: number): number {
  const buffer = new ArrayBuffer(4);
  const uint32View = new Uint32Array(buffer);
  const int32View = new Int32Array(buffer);
  uint32View[0] = n;
  return int32View[0] as number;
}
