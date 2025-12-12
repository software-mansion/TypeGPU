import * as d from 'typegpu/data';
import * as std from 'typegpu/std';

export const getColorA = () => {
  'use gpu';
  return d.vec4f(0.769, 0.392, 1.0, 1);
};

export const getColorB = () => {
  'use gpu';
  return d.vec4f(0.114, 0.447, 0.941, 1);
};

export const getColorComplex = () => {
  return std.mix(getColorA(), getColorB(), 0.8);
};
