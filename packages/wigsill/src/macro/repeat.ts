import { WGSLCode, code } from '../wgslCode';
import { WGSLSegment } from './../types';

export function repeat(
  snippet: string | WGSLSegment | ((idx: number) => string | WGSLSegment),
  count: number,
): WGSLCode {
  if (typeof snippet === 'function') {
    return code`${Array.from({ length: count }, (_, idx) => snippet(idx))}`;
  }

  return code`${Array.from({ length: count }, () => snippet)}`;
}
