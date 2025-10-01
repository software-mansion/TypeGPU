// Mixed imports - core with data types
import tgpu from 'typegpu';
import { f32, vec3f, struct } from 'typegpu/data';

const MyStruct = struct({
  position: vec3f,
  scale: f32,
});

const mySlot = tgpu.slot();

console.log('Mixed usage:', {
  struct: typeof MyStruct,
  slot: typeof mySlot,
  resolve: typeof tgpu.resolve,
});