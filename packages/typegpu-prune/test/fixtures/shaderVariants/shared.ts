import { std } from 'typegpu';

const hash = (x: number): number => {
  'use gpu';
  return std.fract(std.sin(x * 12.9898) * 43758.5453);
};

const smooth = (x: number): number => {
  'use gpu';
  const t = std.saturate(x);
  return t * t * (3 - 2 * t);
};

export const noise = (x: number): number => {
  'use gpu';
  const i = std.floor(x);
  return std.mix(hash(i), hash(i + 1), smooth(std.fract(x)));
};

export const add = (a: number, b: number): number => {
  'use gpu';
  return a + b;
};

export const mul = (a: number, b: number): number => {
  'use gpu';
  return a * b;
};

export const min = (a: number, b: number): number => {
  'use gpu';
  return std.min(a, b);
};

export const max = (a: number, b: number): number => {
  'use gpu';
  return std.max(a, b);
};
