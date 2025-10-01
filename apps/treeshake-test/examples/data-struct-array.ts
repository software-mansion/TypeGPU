// Struct and array creation
import { struct, arrayOf, f32, vec3f } from 'typegpu/data';

const MyStruct = struct({
  position: vec3f,
  scale: f32,
});

const MyArray = arrayOf(f32, 10);

console.log('Struct type:', typeof MyStruct);
console.log('Array type:', typeof MyArray);