// Standard library - matrix operations
import { transpose, determinant, rotationX4, identity4 } from 'typegpu/std';

console.log('Matrix functions:', {
  transpose: typeof transpose,
  determinant: typeof determinant,
  rotationX4: typeof rotationX4,
  identity4: typeof identity4,
});