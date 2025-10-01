// Variable declarations
import { tgpu } from 'typegpu';
import { f32, vec3f } from 'typegpu/data';

const privateVar = tgpu.privateVar(f32);
const workgroupVar = tgpu.workgroupVar(vec3f);
const constant = tgpu.const(f32, 42);

console.log('Private variable type:', typeof privateVar);
console.log('Workgroup variable type:', typeof workgroupVar);
console.log('Constant type:', typeof constant);