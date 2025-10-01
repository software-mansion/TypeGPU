// Core functionality - resolve and function definition
import { tgpu, prepareDispatch } from 'typegpu';
import { f32 } from 'typegpu/data';

const myFn = tgpu.fn([], f32);

console.log('Function type:', typeof myFn);
console.log('prepareDispatch type:', typeof prepareDispatch);
console.log('resolve type:', typeof tgpu.resolve);