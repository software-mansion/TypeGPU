// Unstable API access
import tgpu from 'typegpu';

const unstableAPI = tgpu['~unstable'];

console.log('Unstable API:', typeof unstableAPI);
console.log('Has fragmentFn:', typeof unstableAPI.fragmentFn);
console.log('Has vertexFn:', typeof unstableAPI.vertexFn);
console.log('Has computeFn:', typeof unstableAPI.computeFn);