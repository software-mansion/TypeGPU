// Mixed imports - data utilities with standard library
import { vec3f, sizeOf } from 'typegpu/data';
import { sin, normalize } from 'typegpu/std';

console.log('Data type size:', sizeOf(vec3f));
console.log('Function types:', {
  sin: typeof sin,
  normalize: typeof normalize,
});