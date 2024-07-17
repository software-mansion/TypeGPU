import { type WGSLCode, code } from '../wgslCode';
import type { WGSLSegment } from './../types';

export function repeat(
  count: number,
  snippet: string | WGSLSegment | ((idx: number) => string | WGSLSegment),
): WGSLCode {
  if (typeof snippet === 'function') {
    return code`${Array.from({ length: count }, (_, idx) => snippet(idx))}`;
  }

  return code`${Array.from({ length: count }, () => snippet)}`;
}
