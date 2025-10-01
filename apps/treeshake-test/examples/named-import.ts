// Named import - specific tgpu exports
import { tgpu } from 'typegpu';

console.log('TypeGPU named export:', typeof tgpu);
console.log('Has fn method:', typeof tgpu.fn);