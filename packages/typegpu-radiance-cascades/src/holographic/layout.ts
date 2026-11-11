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

export function getDispatchSize(count: number) {
  const rows = Math.ceil(count / (65535 * 64));
  return [Math.ceil(count / (64 * rows)), rows] as const;
}

export function getByteSize(size: readonly [number, number], rgb: boolean, hasSource: boolean) {
  const info = getLayout(size);
  return (
    info.bytes +
    (rgb ? info.intervalCounts.reduce((total, count) => total + count * 4, 0) : 0) +
    (hasSource ? size[0] * size[1] * 8 : 0)
  );
}

type PassGeometry = {
  quadrant: number;
  level: number;
  /** Extent along the sweep direction */
  width: number;
  /** Extent across the sweep direction */
  height: number;
  step: number;
  count: number;
  dispatchSize: readonly [number, number];
};

/** Extends intervals one level up the pyramid, from `pyramid[source]` into `pyramid[target]` */
export type UpPass = PassGeometry & {
  kind: 'up';
  /** Integrates the medium directly instead of joining two lower intervals */
  traced: boolean;
  source: number;
  target: number;
};

/** Gathers fluence one level down the pyramid */
export type DownPass = PassGeometry & {
  kind: 'down';
  /** The topmost level, which has no upper fluence to read */
  top: boolean;
  /** Level 0, which writes the sector texture instead of a fluence buffer */
  final: boolean;
  near: number;
  far: number;
  upper: number;
  target: number;
};

/**
 * Every pass of one solve, in recording order. Depends only on the grid size, so it's shared by
 * `define`-time code and the instance.
 */
export function getPasses(
  size: readonly [number, number],
  tracedLevels: number,
): (UpPass | DownPass)[] {
  const passes: (UpPass | DownPass)[] = [];

  for (let quadrant = 0; quadrant < 4; quadrant++) {
    const width = size[quadrant % 2] as number;
    const height = size[1 - (quadrant % 2)] as number;
    const levels = Math.ceil(Math.log2(width));

    for (let level = 0; level <= levels; level++) {
      const step = 2 ** level;
      const traced = level < tracedLevels;
      const directions = traced ? step + 1 : step / 2 + 1;
      const count = Math.ceil(width / step) * height * directions;
      passes.push({
        kind: 'up',
        traced,
        quadrant,
        level,
        width,
        height,
        step,
        count,
        dispatchSize: getDispatchSize(count),
        source: level === 0 ? 1 : level - 1,
        target: level,
      });
    }

    for (let level = levels - 1; level >= 0; level--) {
      const step = 2 ** level;
      const count = Math.ceil(width / step) * height * step;
      passes.push({
        kind: 'down',
        top: level === levels - 1,
        final: level === 0,
        quadrant,
        level,
        width,
        height,
        step,
        count,
        dispatchSize: getDispatchSize(count),
        near: level,
        far: level + 1,
        upper: 1 - (level % 2),
        target: level % 2,
      });
    }
  }

  return passes;
}
