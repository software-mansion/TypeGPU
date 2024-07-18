import type { Wgsl } from '../types';
import { code } from '../wgslCode';

export function repeat(
  count: number,
  snippet: Wgsl | ((idx: number) => Wgsl),
): Wgsl {
  if (typeof snippet === 'function') {
    return code`${Array.from({ length: count }, (_, idx) => snippet(idx))}`;
  }

  return code`${Array.from({ length: count }, () => snippet)}`;
}
