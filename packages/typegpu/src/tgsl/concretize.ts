import type { AnyWgslData } from '../data/wgslTypes.ts';
import { f32, i32 } from '../data/numeric.ts';

export function concretize(type: AnyWgslData): AnyWgslData {
  if (type.type === 'abstractFloat') {
    return f32;
  }

  if (type.type === 'abstractInt') {
    return i32;
  }

  return type;
}
