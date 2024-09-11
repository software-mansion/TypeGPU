import { code } from '../tgpuCode';
import { identifier } from '../tgpuIdentifier';
import type { Eventual, Wgsl } from '../types';

export function repeat(
  count: Eventual<Wgsl>,
  snippet: Eventual<Wgsl | ((idx: Wgsl) => Wgsl)>,
): Wgsl;

export function repeat(
  count: Eventual<number>,
  snippet: Eventual<Wgsl | ((idx: number) => Wgsl)>,
): Wgsl;

export function repeat(
  count: Eventual<Wgsl>,
  snippet: Eventual<Wgsl | ((idx: number) => Wgsl) | ((idx: Wgsl) => Wgsl)>,
): Wgsl {
  return code`${(get) => {
    const countValue = get(count);
    const snippetValue = get(snippet);

    if (typeof countValue !== 'number') {
      const index = identifier().$name('i');

      if (typeof snippetValue === 'function') {
        return code`
          for (var ${index} = 0; ${index} < ${countValue}; ${index} += 1) {
            ${snippetValue(index as unknown as number) /* silencing TypeScript with the cast */}
          }`;
      }

      return code`
        for (var ${index} = 0; ${index} < ${countValue}; ${index} += 1) {
          ${snippetValue}
        }`;
    }

    if (typeof snippetValue === 'function') {
      return code`${Array.from({ length: countValue }, (_, idx) => snippetValue(idx))}`;
    }

    return code`${Array.from({ length: countValue }, () => snippetValue)}`;
  }}`;
}
