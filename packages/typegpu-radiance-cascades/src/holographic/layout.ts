export function getLayout(size: readonly [number, number]) {
  const levels = Math.ceil(Math.log2(Math.max(...size)));
  const planeCount = (level: number) =>
    Math.max(
      ...size.map((width, axis) =>
        level <= Math.ceil(Math.log2(width))
          ? Math.ceil(width / 2 ** level) * size[axis === 0 ? 1 : 0]
          : 0,
      ),
    );

  const intervalCounts = Array.from(
    { length: levels + 1 },
    (_, level) => planeCount(level) * (2 ** level + 1),
  );
  const fluenceCount = Math.max(
    ...intervalCounts.map((_, level) => planeCount(level) * 2 ** level),
  );

  return {
    intervalCounts,
    fluenceCount,
    bytes:
      intervalCounts.reduce((a, b) => a + b * 8, 0) + fluenceCount * 16 + size[0] * size[1] * 40,
  };
}
