// Matrix types and constructors
import { mat2x2f, mat3x3f, mat4x4f } from 'typegpu/data';

console.log('mat2x2f type:', typeof mat2x2f);
console.log('mat3x3f type:', typeof mat3x3f);
console.log('mat4x4f type:', typeof mat4x4f);

// Create matrix instances
const m2 = mat2x2f();
const m3 = mat3x3f();
const m4 = mat4x4f();

console.log('Created matrices:', m2, m3, m4);