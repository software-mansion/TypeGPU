import tgpu, { d, std } from 'typegpu';

export const getColorA = () => {
  'use gpu';
  return d.vec4f(0.769, 0.392, 1.0, 1);
};

export const getColorB = () => {
  'use gpu';
  return d.vec4f(0.114, 0.447, 0.941, 1);
};

export const getColorComplex = () => {
  'use gpu';
  return std.mix(getColorA(), getColorB(), 0.8);
};

const colorAlpha = tgpu.const(d.f32, 1);

export const getColorC = () => {
  'use gpu';
  return d.vec4f(0.769, 0.392, 1.0, colorAlpha.$);
};

const getC1 = () => {
  'use gpu';
  return getColorC();
};
const getC2 = () => {
  'use gpu';
  return getColorC();
};

export const getColorDiamond = () => {
  'use gpu';
  return std.mix(getC1(), getC2(), 0.8);
};
