// Namespace import of data module
import * as d from 'typegpu/data';

console.log('Data module:', typeof d);
console.log('sizeOf f32:', d.sizeOf(d.f32));
console.log('vec3f type:', typeof d.vec3f);