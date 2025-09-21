import { EPS } from './constants.ts';

export const minmaxScaler = {
  scale: (arr: number[]): number[] => {
    const [min, max] = arr.reduce(
      (acc, val) => [Math.min(acc[0], val), Math.max(acc[1], val)],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    );
    const range = max - min;
    return arr.map((e) => (2 * (e - min)) / (range + EPS) - 1);
  },
};

export const signPreservingScaler = {
  scale: (arr: number[]): number[] => {
    const absMax = arr.reduce(
      (acc, val) => Math.max(Math.abs(acc), Math.abs(val)),
      0,
    );
    return arr.map((e) => e / (absMax + EPS));
  },
};
