// Attributes and decorators
import { f32, location, align, size, interpolate } from 'typegpu/data';

const decoratedType = location(0, interpolate('linear', f32));
const alignedType = align(16, f32);
const sizedType = size(32, f32);

console.log('Decorated type:', typeof decoratedType);
console.log('Aligned type:', typeof alignedType);
console.log('Sized type:', typeof sizedType);