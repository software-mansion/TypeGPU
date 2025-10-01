// Standard library - vector functions
import { dot, cross, normalize, length, distance } from 'typegpu/std';

console.log('Vector functions:', {
  dot: typeof dot,
  cross: typeof cross,
  normalize: typeof normalize,
  length: typeof length,
  distance: typeof distance,
});