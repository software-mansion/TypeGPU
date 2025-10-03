import * as c from './constants.ts';
import type { IScaler } from './types.ts';

const MinMaxScaler: IScaler = {
  fit(data: number[]): { offset: number; scale: number } {
    const [min, max] = data.reduce(
      (acc, val) => [Math.min(acc[0], val), Math.max(acc[1], val)],
      [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    );
    const offset = -2 * min / (max - min + c.EPS) - 1;
    const scale = 2 / (max - min + c.EPS);
    return { offset, scale };
  },
};

const SignPreservingScaler = {
  fit: (data: number[]): { offset: number; scale: number } => {
    const absMax = data.reduce(
      (acc, val) => Math.max(Math.abs(acc), Math.abs(val)),
      0,
    );
    return { offset: 0, scale: 1 / (absMax + c.EPS) };
  },
};

const IdentityScaler: IScaler = {
  fit(data: number[]) {
    return { scale: 1, offset: 0 };
  },
};

export const Scalers = {
  MinMaxScaler,
  IdentityScaler,
  SignPreservingScaler,
};
