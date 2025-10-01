// Buffer and slot functionality
import { tgpu } from 'typegpu';
import { f32, arrayOf } from 'typegpu/data';

const BufferSchema = arrayOf(f32, 100);
const mySlot = tgpu.slot();

console.log('Slot type:', typeof mySlot);
console.log('BufferSchema type:', typeof BufferSchema);
console.log('bindGroupLayout type:', typeof tgpu.bindGroupLayout);