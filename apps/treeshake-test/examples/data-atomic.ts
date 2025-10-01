// Atomic operations
import { atomic, i32 } from 'typegpu/data';

const atomicInt = atomic(i32);

console.log('Atomic type:', typeof atomicInt);