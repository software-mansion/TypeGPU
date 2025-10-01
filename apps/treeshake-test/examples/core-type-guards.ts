// Type guard functions
import { 
  isBuffer, 
  isUsableAsVertex, 
  isDerived, 
  isSlot, 
  isTgpuFn,
  isVariable 
} from 'typegpu';

console.log('Type guards:', {
  isBuffer: typeof isBuffer,
  isUsableAsVertex: typeof isUsableAsVertex,
  isDerived: typeof isDerived,
  isSlot: typeof isSlot,
  isTgpuFn: typeof isTgpuFn,
  isVariable: typeof isVariable,
});