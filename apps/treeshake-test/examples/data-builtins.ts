// Builtin values
import { builtin } from 'typegpu/data';

const position = builtin.position;
const vertexIndex = builtin.vertexIndex;
const fragDepth = builtin.fragDepth;

console.log('Builtin values:', {
  position: typeof position,
  vertexIndex: typeof vertexIndex,
  fragDepth: typeof fragDepth,
});