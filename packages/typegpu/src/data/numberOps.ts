export const smoothstepScalar = (edge0: number, edge1: number, x: number): number => {
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
  const dataView = new DataView(new ArrayBuffer(4));
  dataView.setUint32(0, n, true);
  return dataView.getFloat32(0, true);
}

export function bitcastU32toI32Impl(n: number): number {
  const dataView = new DataView(new ArrayBuffer(4));
  dataView.setUint32(0, n, true);
  return dataView.getInt32(0, true);
}
