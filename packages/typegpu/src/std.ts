import type { vecBase } from './data';

function dot<T extends vecBase>(lhs: T, rhs: T): number {
  let result = 0;
  for (let i = 0; i < lhs.length; ++i) {
    result += lhs.at(i) * rhs.at(i);
  }
  return result;
}

function fract(a: number): number {
  return a - Math.trunc(a);
}

export const std = {
  dot,
  fract,
  sin: Math.sin,
  cos: Math.cos,
};
