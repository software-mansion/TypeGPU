import type { Eventual, Wgsl } from '../types';
import { code } from '../wgslCode';

export const repeat = (
  count: Eventual<number>,
  snippet: Eventual<Wgsl | ((idx: number) => Wgsl)>,
): Wgsl =>
  code`${(get) => {
    const snippetValue = get(snippet);
    const countValue = get(count);

    if (typeof snippetValue === 'function') {
      return code`${Array.from({ length: countValue }, (_, idx) => snippetValue(idx))}`;
    }

    return code`${Array.from({ length: countValue }, () => snippetValue)}`;
  }}`;
