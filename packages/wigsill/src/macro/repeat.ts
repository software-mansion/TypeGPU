import { type WGSLCode, code } from '../wgslCode';
import type { Wgsl } from './../types';

export function repeat(
  count: number,
  snippet: Wgsl | ((idx: number) => Wgsl),
): WGSLCode {
  if (typeof snippet === 'function') {
    return code`${Array.from({ length: count }, (_, idx) => snippet(idx))}`;
  }

  return code`${Array.from({ length: count }, () => snippet)}`;
}
