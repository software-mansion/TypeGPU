import type { vecBase } from './data';

function dot<T extends vecBase>(lhs: T, rhs: T): number {
  let result = 0;
  for (let i = 0; i < lhs.length; ++i) {
    result += lhs.at(i) * rhs.at(i);
  }
  return result;
}

function length<T extends vecBase>(vector: T): number {
  let lengthSq = 0;
  for (let i = 0; i < vector.length; ++i) {
    lengthSq += vector.at(i) ** 2;
  }
  return Math.sqrt(lengthSq);
}

function normalize<T extends vecBase>(vector: T): T {
  const len = length(vector);
  return result;
}

function fract(a: number): number {
  return a - Math.trunc(a);
}

export const std = {
  dot,
  fract,
  length,
  normalize,
  sin: Math.sin,
  cos: Math.cos,
};
