// Data utilities - size and alignment functions
import { f32, sizeOf, alignmentOf } from 'typegpu/data';

console.log('sizeOf f32:', sizeOf(f32));
console.log('alignmentOf f32:', alignmentOf(f32));