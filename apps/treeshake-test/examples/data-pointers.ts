// Pointer types
import { ptrStorage, ptrUniform, ptrWorkgroup, f32 } from 'typegpu/data';

const storagePtr = ptrStorage(f32);
const uniformPtr = ptrUniform(f32);
const workgroupPtr = ptrWorkgroup(f32);

console.log('Storage pointer:', typeof storagePtr);
console.log('Uniform pointer:', typeof uniformPtr);
console.log('Workgroup pointer:', typeof workgroupPtr);