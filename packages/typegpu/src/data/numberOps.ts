export const smoothstepScalar = (
  edge0: number,
  edge1: number,
  x: number,
): number => {
  const t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
  return t * t * (3 - 2 * t);
};

export const clamp = (value: number, low: number, high: number) =>
  Math.min(Math.max(low, value), high);
