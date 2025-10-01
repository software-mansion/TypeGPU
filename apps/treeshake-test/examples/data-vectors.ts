// Vector types and constructors
import { vec2f, vec3f, vec4f, } from 'typegpu/data';

console.log('vec2f type:', typeof vec2f);
console.log('vec3f type:', typeof vec3f);
console.log('vec4f type:', typeof vec4f);

// Create vector instances
const v2 = vec2f(1.0, 2.0);
const v3 = vec3f(1.0, 2.0, 3.0);
const v4 = vec4f(1.0, 2.0, 3.0, 4.0);

console.log('Created vectors:', v2, v3, v4);